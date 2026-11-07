import { Check, FileSpreadsheet } from 'lucide-react'
import { useId, useState } from 'react'
import type { MenuItemInput } from '../../shared/menu'
import {
  IMPORT_LIMIT,
  menuImportResultSchema,
  rowsToMenu,
} from '../../shared/menu-import'
import {
  type MenuTemplate,
  menuTemplates,
  templateItems,
} from '../../shared/menu-templates'
import { formatIdr, useI18n } from '../i18n'
import { api } from '../lib/api'
import { failureText } from '../lib/commands'
import { Button } from '../ui/button'
import { Chip } from '../ui/chip'
import { Dialog } from '../ui/dialog'
import { Switch } from '../ui/switch'
import { readMenuFile } from './menu-file'

type Picked = { file: string; items: MenuItemInput[]; skipped: number }

/** Adds a whole menu from a ready template or an .xlsx/.csv file, with a preview first. */
export function MenuImportDialog({
  open,
  shownCount,
  nextSort,
  onClose,
  onImported,
}: {
  open: boolean
  shownCount: number
  nextSort: number
  onClose: () => void
  onImported: (message: string) => void
}) {
  const { lang, t } = useI18n()
  const templates = menuTemplates(lang)
  const inputId = useId()
  const [source, setSource] = useState<'template' | 'file'>('template')
  const [picked, setPicked] = useState<Picked | null>(null)
  const [template, setTemplate] = useState<string | null>(null)
  // A template or a whole file usually replaces the menu a new dapur starts with.
  const [hideCurrent, setHideCurrent] = useState(true)

  function chooseTemplate(chosen: MenuTemplate) {
    setError(null)
    setTemplate(chosen.id)
    setPicked({
      file: chosen.name,
      items: templateItems(chosen, nextSort),
      skipped: 0,
    })
  }

  function switchTo(next: 'template' | 'file') {
    if (next === source) return
    setSource(next)
    setPicked(null)
    setTemplate(null)
    setError(null)
  }
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function pick(file: File | undefined) {
    if (!file) return
    setError(null)
    setPicked(null)
    let rows: string[][]
    try {
      rows = await readMenuFile(file)
    } catch {
      setError(t('importUnreadable'))
      return
    }
    const result = rowsToMenu(rows, nextSort, lang)
    if (!result.ok) {
      setError(
        t(result.reason === 'no_header' ? 'importNoHeader' : 'importNoRows'),
      )
      return
    }
    if (result.items.length > IMPORT_LIMIT) {
      setError(t('importTooMany', { max: IMPORT_LIMIT }))
      return
    }
    setPicked({ file: file.name, items: result.items, skipped: result.skipped })
  }

  async function submit() {
    if (!picked) return
    setBusy(true)
    const result = await api(
      '/api/manager/menu/import',
      menuImportResultSchema,
      {
        body: { items: picked.items, hideCurrent },
      },
    )
    setBusy(false)
    if (!result.ok) {
      setError(failureText(result, t))
      return
    }
    const { added, skipped } = result.data
    onImported(
      skipped > 0
        ? t('importDoneSkipped', { added, skipped })
        : t('importDone', { added }),
    )
  }

  const categories = picked
    ? [...new Set(picked.items.map((i) => i.category))].map((category) => {
        const rows = picked.items.filter((i) => i.category === category)
        return { category, rows }
      })
    : []

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={t('importTitle')}
      description={t(source === 'template' ? 'templateHint' : 'importHint')}
      wide
      footer={
        <>
          <Button variant="text" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button disabled={!picked || busy} onClick={() => void submit()}>
            {picked
              ? t('importAdd', { count: picked.items.length })
              : t('importAction')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 pt-2">
        <div className="flex flex-wrap gap-2">
          <Chip
            selected={source === 'template'}
            onClick={() => switchTo('template')}
          >
            {t('fromTemplate')}
          </Chip>
          <Chip selected={source === 'file'} onClick={() => switchTo('file')}>
            {t('fromFile')}
          </Chip>
        </div>

        {source === 'template' ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {templates.map((item) => {
              const selected = template === item.id
              return (
                <li key={item.id} className="grid">
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => chooseTemplate(item)}
                    className={`state grid min-h-20 content-start gap-0.5 rounded-md border px-4 py-3 text-left transition-[background-color,border-color,scale] duration-150 active:scale-[0.98] ${selected ? 'border-transparent [--bg:var(--color-tonal)]' : 'border-line'}`}
                  >
                    <span className="flex items-center justify-between gap-2 font-medium">
                      {item.name}
                      {selected && (
                        <Check size={18} strokeWidth={2.5} aria-hidden />
                      )}
                    </span>
                    <span className="text-sm text-ink-soft">{item.lead}</span>
                    <span className="text-sm text-ink-soft tabular-nums">
                      {t('templateCount', { count: item.items.length })}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <label
            htmlFor={inputId}
            className="state flex min-h-16 cursor-pointer items-center gap-3 rounded-md border border-dashed border-ink-soft px-4 py-3 focus-within:shadow-[inset_0_0_0_2px_var(--color-ink)]"
          >
            <FileSpreadsheet size={24} aria-hidden className="shrink-0" />
            <span className="grid min-w-0">
              <span className="font-medium break-words">
                {picked ? picked.file : t('importPick')}
              </span>
              <span className="text-sm text-ink-soft">
                {t('importFormats')}
              </span>
            </span>
            <input
              id={inputId}
              type="file"
              accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={(e) => {
                void pick(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>
        )}

        {error && (
          <p role="alert" className="font-semibold">
            {error}
          </p>
        )}

        {picked && (
          <>
            <p className="text-[15px]" aria-live="polite">
              {t('importSummary', {
                count: picked.items.length,
                categories: categories.length,
              })}
              {picked.skipped > 0 &&
                ` ${t('importSkippedRows', { count: picked.skipped })}`}
            </p>
            <section
              aria-label={t('importPreview')}
              // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling box must be reachable by keyboard
              tabIndex={0}
              className="grid max-h-72 gap-3 overflow-y-auto overscroll-contain rounded-md bg-wash p-4"
            >
              {categories.map(({ category, rows }) => (
                <div key={category} className="grid gap-1">
                  <h3 className="text-sm font-medium text-ink-soft">
                    {category} · {rows.length}
                  </h3>
                  <ul className="grid gap-0.5 text-[15px]">
                    {rows.map((item) => (
                      <li
                        key={item.sort}
                        className="flex items-baseline justify-between gap-3"
                      >
                        <span className="min-w-0 break-words">{item.name}</span>
                        <span className="shrink-0 tabular-nums text-ink-soft">
                          {formatIdr(item.priceIdr)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
            {shownCount > 0 && (
              <Switch
                label={t('importHideCurrent', { count: shownCount })}
                hint={t('importHideCurrentHint')}
                checked={hideCurrent}
                onChange={setHideCurrent}
              />
            )}
          </>
        )}
      </div>
    </Dialog>
  )
}
