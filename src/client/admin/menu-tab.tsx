import { Eye, LoaderCircle, Plus } from 'lucide-react'
import {
  type SubmitEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { z } from 'zod'
import {
  type AdminMenuItem,
  type AdminTable,
  adminMenuSchema,
  adminTableSchema,
  adminTablesSchema,
  type TableInput,
} from '../../shared/menu'
import { formatIdr, useI18n } from '../i18n'
import { api } from '../lib/api'
import { stagger } from '../lib/stagger'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { Dialog } from '../ui/dialog'
import { Switch } from '../ui/switch'
import { TextField } from '../ui/text-field'
import { MenuItemDialog, saveMenuItem, toInput } from './menu-item-dialog'
import { useEditing } from './shared'

const nextSort = (rows: { sort: number }[]) =>
  rows.reduce((max, r) => Math.max(max, r.sort), 0) + 1

export function MenuTab({
  menuVersion,
  notify,
}: {
  menuVersion: number | undefined
  notify: (text: string) => void
}) {
  const { t } = useI18n()
  const [items, setItems] = useState<AdminMenuItem[] | null>(null)
  const [tables, setTables] = useState<AdminTable[] | null>(null)
  // A local edit outdates any load still in flight, so it can't flip a switch back.
  const generation = useRef(0)

  const load = useCallback(async () => {
    const started = ++generation.current
    const [m, tb] = await Promise.all([
      api('/api/manager/menu', adminMenuSchema),
      api('/api/manager/tables', adminTablesSchema),
    ])
    if (started !== generation.current) return
    if (m.ok) setItems(m.data.items)
    if (tb.ok) setTables(tb.data.tables)
    if (!m.ok || !tb.ok) notify(t('networkError'))
  }, [notify, t])

  // Also reloads when another admin screen changes the menu.
  // biome-ignore lint/correctness/useExhaustiveDependencies: menuVersion only triggers a reload
  useEffect(() => {
    void load()
  }, [load, menuVersion])

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
      <MenuItems
        items={items}
        setItems={(update) => {
          generation.current++
          setItems(update)
        }}
        reload={load}
        notify={notify}
      />
      <Tables tables={tables} reload={load} notify={notify} />
    </div>
  )
}

function MenuItems({
  items,
  setItems,
  reload,
  notify,
}: {
  items: AdminMenuItem[] | null
  setItems: (
    update: (list: AdminMenuItem[] | null) => AdminMenuItem[] | null,
  ) => void
  reload: () => Promise<void>
  notify: (text: string) => void
}) {
  const { t } = useI18n()
  const editing = useEditing<AdminMenuItem>()
  const shown = items?.filter((i) => !i.hidden) ?? []
  const hidden = items?.filter((i) => i.hidden) ?? []
  const categories = [...new Set(items?.map((i) => i.category))]
  const byCategory = categories
    .map((category) => ({
      category,
      rows: shown.filter((i) => i.category === category),
    }))
    .filter((c) => c.rows.length > 0)

  async function update(item: AdminMenuItem, patch: Partial<AdminMenuItem>) {
    const next = { ...item, ...patch }
    setItems((list) => list?.map((i) => (i.id === item.id ? next : i)) ?? null)
    const result = await saveMenuItem(item.id, toInput(next))
    if (!result.ok) {
      notify(t('networkError'))
      await reload()
      return false
    }
    return true
  }

  let index = 0
  return (
    <section
      aria-labelledby="menu-items"
      className="grid content-start gap-6 lg:pt-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="menu-items" className="text-2xl font-medium">
          {t('menuTitle')}
        </h2>
        <Button
          icon={<Plus size={18} aria-hidden />}
          onClick={() => editing.start(null)}
        >
          {t('addItem')}
        </Button>
      </div>

      {items === null && (
        <LoaderCircle
          className="animate-spin text-ink-soft"
          size={28}
          aria-label={t('loading')}
        />
      )}
      {items && shown.length === 0 && (
        <p className="text-ink-soft">{t('emptyMenu')}</p>
      )}

      {byCategory.map(({ category, rows }) => (
        <div key={category} className="grid gap-2">
          <h3 className="px-1 text-sm font-medium text-ink-soft">{category}</h3>
          <ul className="grid gap-2">
            {rows.map((item) => (
              <li
                key={item.id}
                style={stagger(index++)}
                className="rise flex min-h-16 items-center gap-3 rounded-md bg-wash pr-4"
              >
                <button
                  type="button"
                  onClick={() => editing.start(item)}
                  className="state grid min-h-16 min-w-0 flex-1 content-center rounded-md px-4 py-2 text-left"
                >
                  <span
                    className={`font-medium break-words ${item.available ? '' : 'text-ink-soft line-through decoration-1'}`}
                  >
                    {item.name}
                  </span>
                  <span className="flex flex-wrap gap-x-3 text-sm text-ink-soft tabular-nums">
                    <span>{formatIdr(item.priceIdr)}</span>
                    {item.modifierGroups.length > 0 && (
                      <span>
                        {t('groupCount', {
                          count: item.modifierGroups.length,
                        })}
                      </span>
                    )}
                    {!item.available && (
                      <span className="font-semibold text-ink">
                        {t('soldOut')}
                      </span>
                    )}
                  </span>
                </button>
                <Switch
                  label={t('available')}
                  hideLabel
                  checked={item.available}
                  onChange={(available) => void update(item, { available })}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}

      {hidden.length > 0 && (
        <details className="group grid gap-2">
          <summary className="state flex min-h-12 cursor-pointer list-none items-center rounded-full px-4 text-[15px] font-medium [&::-webkit-details-marker]:hidden">
            {t('hiddenItems', { count: hidden.length })}
          </summary>
          <ul className="mt-2 grid gap-2">
            {hidden.map((item, i) => (
              <li
                key={item.id}
                style={stagger(i)}
                className="rise flex min-h-16 items-center gap-3 rounded-md border border-dashed border-ink-soft px-4 py-2"
              >
                <span className="mr-auto grid min-w-0">
                  <span className="font-medium break-words">{item.name}</span>
                  <span className="text-sm text-ink-soft">{item.category}</span>
                </span>
                <Button
                  variant="text"
                  icon={<Eye size={18} aria-hidden />}
                  onClick={async () => {
                    if (await update(item, { hidden: false })) {
                      notify(t('shown', { name: item.name }))
                    }
                  }}
                >
                  {t('unhide')}
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <MenuItemDialog
        key={editing.key}
        open={editing.open}
        item={editing.target}
        categories={categories}
        nextSort={nextSort(items ?? [])}
        onClose={editing.close}
        onSaved={(message) => {
          editing.close()
          notify(message)
          void reload()
        }}
      />
    </section>
  )
}

const tableResult = z.object({ table: adminTableSchema })

function saveTable(id: string | null, input: TableInput) {
  return id
    ? api(`/api/manager/tables/${id}`, tableResult, {
        method: 'PUT',
        body: input,
      })
    : api('/api/manager/tables', tableResult, { body: input })
}

function Tables({
  tables,
  reload,
  notify,
}: {
  tables: AdminTable[] | null
  reload: () => Promise<void>
  notify: (text: string) => void
}) {
  const { t } = useI18n()
  const editing = useEditing<AdminTable>()

  return (
    <Card className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-medium">{t('tablesTitle')}</h2>
        <Button
          variant="tonal"
          icon={<Plus size={18} aria-hidden />}
          onClick={() => editing.start(null)}
        >
          {t('addTable')}
        </Button>
      </div>
      {tables && tables.length === 0 && (
        <p className="text-[15px] text-ink-soft">{t('noTables')}</p>
      )}
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-3">
        {tables?.map((table, i) => (
          <li key={table.id} style={stagger(i)} className="rise grid">
            <button
              type="button"
              onClick={() => editing.start(table)}
              className={`state min-h-14 rounded-sm px-2 text-[15px] font-medium transition-[background-color,scale] duration-150 active:scale-[0.97] ${table.active ? '[--bg:var(--color-surface)]' : 'border border-dashed border-ink-soft text-ink-soft'}`}
            >
              {table.label}
            </button>
          </li>
        ))}
      </ul>
      <TableDialog
        key={editing.key}
        open={editing.open}
        table={editing.target}
        nextSort={nextSort(tables ?? [])}
        onClose={editing.close}
        onSaved={(label) => {
          editing.close()
          notify(t('itemSaved', { name: label }))
          void reload()
        }}
      />
    </Card>
  )
}

function TableDialog({
  open,
  table,
  nextSort,
  onClose,
  onSaved,
}: {
  open: boolean
  table: AdminTable | null
  nextSort: number
  onClose: () => void
  onSaved: (label: string) => void
}) {
  const { t } = useI18n()
  const [label, setLabel] = useState(table?.label ?? '')
  const [sort, setSort] = useState(String(table?.sort ?? nextSort))
  const [active, setActive] = useState(table?.active ?? true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (label.trim() === '') return setError(t('fieldRequired'))
    setBusy(true)
    const result = await saveTable(table?.id ?? null, {
      label: label.trim(),
      sort: Number(sort || '0'),
      active,
    })
    setBusy(false)
    if (!result.ok) {
      setError(
        result.status === 0
          ? t('networkError')
          : t('rejected', { message: result.message }),
      )
      return
    }
    onSaved(result.data.table.label)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={table ? t('editTable') : t('addTable')}
      footer={
        <>
          <Button variant="text" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            form="table-form"
            disabled={busy || label.length > 20}
          >
            {t('save')}
          </Button>
        </>
      }
    >
      <form
        id="table-form"
        onSubmit={submit}
        noValidate
        className="grid gap-2 pt-2 sm:grid-cols-[minmax(0,1fr)_8rem] sm:gap-x-4"
      >
        <TextField
          label={t('tableLabel')}
          hint={t('tableLabelHint')}
          max={20}
          autoComplete="off"
          autoFocus
          value={label}
          onChange={(e) => {
            setLabel(e.target.value)
            setError(null)
          }}
          error={error}
        />
        <TextField
          label={t('sortOrder')}
          inputMode="numeric"
          autoComplete="off"
          value={sort}
          onChange={(e) =>
            setSort(e.target.value.replace(/\D/g, '').slice(0, 5))
          }
          className="tabular-nums"
        />
        <div className="sm:col-span-2">
          <Switch
            label={t('tableActive')}
            hint={t('tableActiveHint')}
            checked={active}
            onChange={setActive}
          />
        </div>
      </form>
    </Dialog>
  )
}
