import {
  ArrowDown,
  ArrowUp,
  Check,
  Eye,
  EyeOff,
  FileSpreadsheet,
  LayoutTemplate,
  ListChecks,
  LoaderCircle,
  Pencil,
  Plus,
  RotateCcw,
  Search,
} from 'lucide-react'
import { type ReactNode, type SubmitEvent, useState } from 'react'
import { z } from 'zod'
import {
  type AdminMenuItem,
  MENU_LIMITS,
  type MenuPatch,
} from '../../shared/menu'
import { formatIdr, useI18n } from '../i18n'
import { api } from '../lib/api'
import { localizeMenuText } from '../lib/board'
import { stagger } from '../lib/stagger'
import { Button, IconButton } from '../ui/button'
import { Chip } from '../ui/chip'
import { Dialog } from '../ui/dialog'
import { Switch } from '../ui/switch'
import { TextField } from '../ui/text-field'
import { MenuImportDialog } from './menu-import-dialog'
import { MenuItemDialog, saveMenuItem, toInput } from './menu-item-dialog'
import { useEditing } from './shared'

type Change = MenuPatch['changes'][number]
const patchResult = z.object({ updated: z.number() })

/** Sends many item changes; the server takes up to 300 per call. */
async function patchMenu(changes: Change[]) {
  for (let i = 0; i < changes.length; i += 300) {
    const result = await api('/api/manager/menu', patchResult, {
      method: 'PATCH',
      body: { changes: changes.slice(i, i + 300) },
    })
    if (!result.ok) return false
  }
  return true
}

const nextSort = (rows: { sort: number }[]) =>
  rows.reduce((max, r) => Math.max(max, r.sort), 0) + 1

// Matches "es teh" in "Es Teh Manis" whatever the case or accents.
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

export function MenuItems({
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
  const { lang, t } = useI18n()
  const editing = useEditing<AdminMenuItem>()
  const [copyOf, setCopyOf] = useState<AdminMenuItem | null>(null)
  const [importing, setImporting] = useState(false)
  const [importKey, setImportKey] = useState(0)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<string | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState(false)

  const all = items ?? []
  const shown = all.filter((i) => !i.hidden)
  const hidden = all.filter((i) => i.hidden)
  const categories = [...new Set(all.map((i) => i.category))]
  const shownCategories = categories.filter((c) =>
    shown.some((i) => i.category === c),
  )
  const activeFilter =
    filter && shownCategories.includes(filter) ? filter : null
  const needle = fold(query.trim())
  const matches = shown.filter(
    (i) =>
      (activeFilter === null || i.category === activeFilter) &&
      (needle === '' ||
        fold(
          `${i.name} ${i.category} ${localizeMenuText(i.category, lang)}`,
        ).includes(needle)),
  )
  const narrowed = needle !== '' || activeFilter !== null
  const byCategory = shownCategories
    .map((category) => ({
      category,
      rows: matches.filter((i) => i.category === category),
    }))
    .filter((c) => c.rows.length > 0)
  const soldOut = shown.filter((i) => !i.available)
  // Items the owner added have random ids; the menu a new dapur starts with does not.
  const sampleOnly =
    shown.length > 0 && shown.every((i) => !/^[0-9a-f-]{36}$/.test(i.id))

  function startImport() {
    setImportKey((k) => k + 1)
    setImporting(true)
  }

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

  /** Applies changes on screen at once, then saves them in one call. */
  async function apply(changes: Change[], message: string) {
    if (changes.length === 0) return true
    const byId = new Map(changes.map((c) => [c.id, c]))
    setItems(
      (list) =>
        list?.map((i) => {
          const change = byId.get(i.id)
          return change ? { ...i, ...change } : i
        }) ?? null,
    )
    setBusy(true)
    const ok = await patchMenu(changes)
    setBusy(false)
    if (!ok) {
      notify(t('networkError'))
      await reload()
      return false
    }
    notify(message)
    return true
  }

  async function bulk(patch: Omit<Change, 'id'>, message: string) {
    const ids = [...selected]
    if (
      await apply(
        ids.map((id) => ({ id, ...patch })),
        message,
      )
    ) {
      setSelected(new Set())
      if (patch.hidden) setSelecting(false)
    }
  }

  function moveCategory(category: string, by: -1 | 1) {
    const order = [...categories]
    const from = order.indexOf(category)
    // Skip over categories that only hold hidden items.
    let to = from + by
    while (
      to >= 0 &&
      to < order.length &&
      !shownCategories.includes(order[to] ?? '')
    ) {
      to += by
    }
    if (to < 0 || to >= order.length) return
    order.splice(from, 1)
    order.splice(to, 0, category)
    let sort = 1
    const changes: Change[] = []
    for (const c of order) {
      for (const item of all.filter((i) => i.category === c)) {
        if (item.sort !== sort) changes.push({ id: item.id, sort })
        sort++
      }
    }
    void apply(
      changes,
      t('categoryMoved', { name: localizeMenuText(category, lang) }),
    )
  }

  function toggle(id: string) {
    setSelected((set) => {
      const next = new Set(set)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function stopSelecting() {
    setSelecting(false)
    setSelected(new Set())
  }

  let index = 0
  return (
    <section
      aria-labelledby="menu-items"
      className="grid content-start gap-5 lg:pt-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="menu-items" className="text-2xl font-medium">
          {t('menuTitle')}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outlined"
            icon={<FileSpreadsheet size={18} aria-hidden />}
            onClick={startImport}
          >
            {t('importAction')}
          </Button>
          <Button
            icon={<Plus size={18} aria-hidden />}
            onClick={() => {
              setCopyOf(null)
              editing.start(null)
            }}
          >
            {t('addItem')}
          </Button>
        </div>
      </div>

      {items === null && (
        <LoaderCircle
          className="animate-spin text-ink-soft"
          size={28}
          aria-label={t('loading')}
        />
      )}
      {items && (shown.length === 0 || sampleOnly) && (
        <div className="rise grid justify-items-start gap-3 rounded-md bg-tonal p-5">
          <p className="text-[15px]">
            {t(sampleOnly ? 'sampleMenuNote' : 'emptyMenu')}
          </p>
          <Button
            icon={<LayoutTemplate size={18} aria-hidden />}
            onClick={startImport}
          >
            {t('useTemplate')}
          </Button>
        </div>
      )}

      {shown.length > 0 && (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1 basis-56">
              <TextField
                label={t('menuSearch')}
                icon={<Search size={16} aria-hidden />}
                type="search"
                autoComplete="off"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Button
              variant={selecting ? 'tonal' : 'text'}
              icon={<ListChecks size={18} aria-hidden />}
              aria-pressed={selecting}
              onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
            >
              {selecting ? t('selectDone') : t('select')}
            </Button>
          </div>
          {shownCategories.length > 1 && (
            <div className="-mx-4 flex snap-x gap-2 overflow-x-auto overscroll-x-contain px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
              <Chip
                selected={activeFilter === null}
                onClick={() => setFilter(null)}
              >
                {t('allCategories')}
              </Chip>
              {shownCategories.map((c) => (
                <Chip
                  key={c}
                  selected={activeFilter === c}
                  onClick={() => setFilter(activeFilter === c ? null : c)}
                >
                  {localizeMenuText(c, lang)}
                </Chip>
              ))}
            </div>
          )}
          {soldOut.length > 0 && !selecting && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-wash px-4 py-2">
              <span className="text-[15px]">
                {t('soldOutCount', { count: soldOut.length })}
              </span>
              <Button
                variant="text"
                icon={<RotateCcw size={18} aria-hidden />}
                disabled={busy}
                onClick={() =>
                  void apply(
                    soldOut.map((i) => ({ id: i.id, available: true })),
                    t('allAvailableDone'),
                  )
                }
              >
                {t('allAvailable')}
              </Button>
            </div>
          )}
        </div>
      )}

      {shown.length > 0 && byCategory.length === 0 && (
        <p className="text-ink-soft">{t('noResults')}</p>
      )}

      {byCategory.map(({ category, rows }) => {
        const position = shownCategories.indexOf(category)
        const categoryLabel = localizeMenuText(category, lang)
        return (
          <div key={category} className="grid gap-2">
            <div className="flex min-h-12 items-center gap-1">
              <h3 className="mr-auto px-1 text-sm font-medium text-ink-soft">
                {categoryLabel}
                <span className="sr-only">, </span>
                <span className="ml-2 tabular-nums" aria-hidden>
                  {rows.length}
                </span>
              </h3>
              {selecting && (
                <Button
                  variant="text"
                  onClick={() =>
                    setSelected((set) => {
                      const next = new Set(set)
                      const allIn = rows.every((r) => next.has(r.id))
                      for (const r of rows) {
                        if (allIn) next.delete(r.id)
                        else next.add(r.id)
                      }
                      return next
                    })
                  }
                >
                  {rows.every((r) => selected.has(r.id))
                    ? t('selectNone')
                    : t('selectAll')}
                </Button>
              )}
              {!selecting && !narrowed && (
                <>
                  <IconButton
                    label={t('renameCategory', { name: categoryLabel })}
                    onClick={() => setRenaming(category)}
                  >
                    <Pencil size={18} aria-hidden />
                  </IconButton>
                  <IconButton
                    label={t('moveUp', { name: categoryLabel })}
                    disabled={busy || position === 0}
                    onClick={() => moveCategory(category, -1)}
                  >
                    <ArrowUp size={18} aria-hidden />
                  </IconButton>
                  <IconButton
                    label={t('moveDown', { name: categoryLabel })}
                    disabled={busy || position === shownCategories.length - 1}
                    onClick={() => moveCategory(category, 1)}
                  >
                    <ArrowDown size={18} aria-hidden />
                  </IconButton>
                </>
              )}
            </div>
            <ul className="grid gap-2">
              {rows.map((item) => {
                const isSelected = selected.has(item.id)
                return (
                  <li
                    key={item.id}
                    style={stagger(index++)}
                    className={`rise flex min-h-16 items-center gap-3 rounded-md pr-4 transition-[background-color] duration-150 ${isSelected ? 'bg-tonal' : 'bg-wash'}`}
                  >
                    <button
                      type="button"
                      aria-pressed={selecting ? isSelected : undefined}
                      onClick={() =>
                        selecting ? toggle(item.id) : editing.start(item)
                      }
                      className="state flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-md px-4 py-2 text-left"
                    >
                      {selecting && (
                        <span
                          aria-hidden
                          className={`grid size-6 shrink-0 place-items-center rounded-[6px] border-2 ${isSelected ? 'border-ink bg-ink text-surface' : 'border-ink-soft'}`}
                        >
                          {isSelected && <Check size={16} strokeWidth={3} />}
                        </span>
                      )}
                      <span className="grid min-w-0">
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
                      </span>
                    </button>
                    {!selecting && (
                      <Switch
                        label={t('availableName', { name: item.name })}
                        hideLabel
                        checked={item.available}
                        onChange={(available) =>
                          void update(item, { available })
                        }
                      />
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}

      {selecting && (
        <div
          role="toolbar"
          aria-label={t('selectedCount', { count: selected.size })}
          className="sticky bottom-[max(1rem,env(safe-area-inset-bottom))] z-10 flex flex-wrap items-center gap-2 rounded-lg bg-ink p-2 pl-5 text-surface shadow-lg"
        >
          <span className="mr-auto py-2 text-[15px] font-medium tabular-nums">
            {t('selectedCount', { count: selected.size })}
          </span>
          <BarButton
            disabled={busy || selected.size === 0}
            onClick={() =>
              void bulk(
                { available: false },
                t('bulkSoldOut', { count: selected.size }),
              )
            }
          >
            {t('markSoldOut')}
          </BarButton>
          <BarButton
            disabled={busy || selected.size === 0}
            onClick={() =>
              void bulk(
                { available: true },
                t('bulkAvailable', { count: selected.size }),
              )
            }
          >
            {t('markAvailable')}
          </BarButton>
          <BarButton
            disabled={busy || selected.size === 0}
            onClick={() =>
              void bulk(
                { hidden: true },
                t('bulkHidden', { count: selected.size }),
              )
            }
          >
            <EyeOff size={18} aria-hidden />
            {t('hide')}
          </BarButton>
        </div>
      )}

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
                className="rise flex min-h-16 items-center gap-1 rounded-md border border-dashed border-ink-soft py-2 pr-2 pl-4"
              >
                <span className="mr-auto grid min-w-0">
                  <span className="font-medium break-words">{item.name}</span>
                  <span className="text-sm text-ink-soft">
                    {localizeMenuText(item.category, lang)}
                  </span>
                </span>
                <IconButton
                  label={t('editItemName', { name: item.name })}
                  onClick={() => {
                    setCopyOf(null)
                    editing.start(item)
                  }}
                >
                  <Pencil size={18} aria-hidden />
                </IconButton>
                <Button
                  variant="text"
                  icon={<Eye size={18} aria-hidden />}
                  onClick={async () => {
                    if (await update(item, { hidden: false })) {
                      notify(t('shown', { name: item.name }))
                    }
                  }}
                >
                  <span className="hidden sm:inline">{t('unhide')}</span>
                  <span className="sr-only sm:hidden">{t('unhide')}</span>
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
        copyOf={copyOf}
        categories={categories}
        nextSort={nextSort(all)}
        onClose={editing.close}
        onDuplicate={(item) => {
          setCopyOf(item)
          editing.start(null)
        }}
        onSaved={(message) => {
          editing.close()
          notify(message)
          void reload()
        }}
      />
      <MenuImportDialog
        key={`import-${importKey}`}
        open={importing}
        shownCount={shown.length}
        nextSort={nextSort(all)}
        onClose={() => setImporting(false)}
        onImported={(message) => {
          setImporting(false)
          notify(message)
          void reload()
        }}
      />
      <RenameCategoryDialog
        key={renaming ?? ''}
        name={renaming}
        taken={categories}
        onClose={() => setRenaming(null)}
        onRename={async (to) => {
          const from = renaming
          if (from === null) return
          const targetCategory =
            categories.find(
              (c) => c !== from && localizeMenuText(c, lang) === to,
            ) ?? to
          const ok = await apply(
            all
              .filter((i) => i.category === from)
              .map((i) => ({ id: i.id, category: targetCategory })),
            t('categoryRenamed', {
              name: localizeMenuText(targetCategory, lang),
            }),
          )
          if (ok) {
            setRenaming(null)
            if (filter === from) setFilter(targetCategory)
          }
        }}
      />
    </section>
  )
}

function BarButton({
  children,
  ...rest
}: {
  children: ReactNode
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="state inline-flex min-h-12 items-center gap-2 rounded-full px-4 text-[15px] font-semibold [--on:var(--color-surface)] disabled:cursor-not-allowed disabled:text-on-ink-soft"
      {...rest}
    >
      {children}
    </button>
  )
}

function RenameCategoryDialog({
  name,
  taken,
  onClose,
  onRename,
}: {
  name: string | null
  taken: string[]
  onClose: () => void
  onRename: (to: string) => Promise<void>
}) {
  const { lang, t } = useI18n()
  const localizedName = name ? localizeMenuText(name, lang) : ''
  const [value, setValue] = useState(localizedName)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const to = value.trim()
    if (to === '') return setError(t('fieldRequired'))
    if (to.length > MENU_LIMITS.category) return
    if (to === name || to === localizedName) return onClose()
    // Two categories with one name would merge their items; say so first.
    if (
      (taken.includes(to) ||
        taken.some((c) => localizeMenuText(c, lang) === to)) &&
      error === null
    ) {
      return setError(t('categoryMerge', { name: to }))
    }
    setBusy(true)
    await onRename(to)
    setBusy(false)
  }

  return (
    <Dialog
      open={name !== null}
      onOpenChange={(next) => !next && onClose()}
      title={t('renameCategoryTitle')}
      footer={
        <>
          <Button variant="text" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" form="category-form" disabled={busy}>
            {t('save')}
          </Button>
        </>
      }
    >
      <form id="category-form" onSubmit={submit} noValidate className="pt-2">
        <TextField
          label={t('category')}
          max={MENU_LIMITS.category}
          autoComplete="off"
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setError(null)
          }}
          error={error}
        />
      </form>
    </Dialog>
  )
}
