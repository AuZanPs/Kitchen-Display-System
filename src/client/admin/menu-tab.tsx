import { Plus } from 'lucide-react'
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
  MENU_LIMITS,
  type TableInput,
} from '../../shared/menu'
import { useI18n } from '../i18n'
import { api } from '../lib/api'
import { failureText } from '../lib/commands'
import { stagger } from '../lib/stagger'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { Dialog } from '../ui/dialog'
import { Switch } from '../ui/switch'
import { TextField } from '../ui/text-field'
import { MenuItems } from './menu-items'
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
      setError(failureText(result, t))
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
            disabled={busy || label.length > MENU_LIMITS.tableLabel}
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
          max={MENU_LIMITS.tableLabel}
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
