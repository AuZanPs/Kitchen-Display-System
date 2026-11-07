import { Copy, EyeOff, Plus, Trash2, X } from 'lucide-react'
import { type SubmitEvent, useState } from 'react'
import { z } from 'zod'
import {
  type AdminMenuItem,
  adminMenuItemSchema,
  MENU_LIMITS,
  type MenuItemInput,
} from '../../shared/menu'
import { formatIdr, useI18n } from '../i18n'
import { api } from '../lib/api'
import { localizeMenuText } from '../lib/board'
import { failureText } from '../lib/commands'
import { uuid } from '../lib/uuid'
import { Button, IconButton } from '../ui/button'
import { Chip } from '../ui/chip'
import { Dialog } from '../ui/dialog'
import { Switch } from '../ui/switch'
import { TextField } from '../ui/text-field'

type OptionDraft = { id: string; name: string; price: string }
type GroupDraft = {
  id: string
  name: string
  required: boolean
  multi: boolean
  options: OptionDraft[]
}

function newOption(): OptionDraft {
  return { id: uuid(), name: '', price: '0' }
}

function newGroup(): GroupDraft {
  return {
    id: uuid(),
    name: '',
    required: false,
    multi: false,
    options: [newOption()],
  }
}

const digits = (value: string) => value.replace(/\D/g, '').slice(0, 8)

function money(value: string): number | null {
  if (value === '') return null
  const n = Number(value)
  return n <= MENU_LIMITS.priceIdr ? n : null
}

const itemResult = z.object({ item: adminMenuItemSchema })

/** Saves a new item (`id` null) or replaces an existing one. */
export function saveMenuItem(id: string | null, input: MenuItemInput) {
  return id
    ? api(`/api/manager/menu/${id}`, itemResult, {
        method: 'PUT',
        body: input,
      })
    : api('/api/manager/menu', itemResult, { body: input })
}

export function toInput({ id: _, ...input }: AdminMenuItem): MenuItemInput {
  return input
}

const deleteResult = z.null()

export function MenuItemDialog({
  open,
  item,
  copyOf = null,
  categories,
  nextSort,
  onClose,
  onDuplicate,
  onSaved,
}: {
  open: boolean
  item: AdminMenuItem | null
  /** A new item that starts as a copy of this one. */
  copyOf?: AdminMenuItem | null
  categories: string[]
  nextSort: number
  onClose: () => void
  onDuplicate?: (item: AdminMenuItem) => void
  onSaved: (message: string) => void
}) {
  const { lang, t } = useI18n()
  const start = item ?? copyOf
  const [name, setName] = useState(
    item?.name ?? (copyOf ? t('copyName', { name: copyOf.name }) : ''),
  )
  const [price, setPrice] = useState(start ? String(start.priceIdr) : '')
  const [category, setCategory] = useState(() => {
    const initial = start?.category ?? categories[0] ?? ''
    return initial ? localizeMenuText(initial, lang) : ''
  })
  const [sort, setSort] = useState(String(item?.sort ?? nextSort))
  const [available, setAvailable] = useState(start?.available ?? true)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [groups, setGroups] = useState<GroupDraft[]>(
    () =>
      start?.modifierGroups.map((g) => ({
        ...g,
        name: localizeMenuText(g.name, lang),
        options: g.options.map((o) => ({
          id: o.id,
          name: localizeMenuText(o.name, lang),
          price: String(o.priceDeltaIdr),
        })),
      })) ?? [],
  )
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const priceIdr = money(price)
  const sortValue = Number(sort || '0')
  const valid =
    name.trim() !== '' &&
    name.length <= MENU_LIMITS.name &&
    priceIdr !== null &&
    category.trim() !== '' &&
    category.length <= MENU_LIMITS.category &&
    groups.every(
      (g) =>
        g.name.trim() !== '' &&
        g.name.length <= MENU_LIMITS.name &&
        g.options.every(
          (o) =>
            o.name.trim() !== '' &&
            o.name.length <= MENU_LIMITS.name &&
            money(o.price) !== null,
        ),
    )
  const required = (value: string) =>
    tried && value.trim() === '' ? t('fieldRequired') : null

  function updateGroup(id: string, patch: Partial<GroupDraft>) {
    setGroups((list) => list.map((g) => (g.id === id ? { ...g, ...patch } : g)))
  }

  function updateOption(
    group: GroupDraft,
    id: string,
    patch: Partial<OptionDraft>,
  ) {
    updateGroup(group.id, {
      options: group.options.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    })
  }

  async function save(hidden: boolean) {
    setTried(true)
    if (!valid || priceIdr === null) return
    setBusy(true)
    const trimmedCategory = category.trim()
    const canonicalCategory =
      categories.find(
        (c) =>
          c.toLowerCase() === trimmedCategory.toLowerCase() ||
          localizeMenuText(c, lang).toLowerCase() ===
            trimmedCategory.toLowerCase(),
      ) ?? trimmedCategory
    const input: MenuItemInput = {
      name: name.trim(),
      priceIdr,
      category: canonicalCategory,
      sort: sortValue,
      available,
      hidden,
      modifierGroups: groups.map((g) => ({
        id: g.id,
        name: g.name.trim(),
        required: g.required,
        multi: g.multi,
        options: g.options.map((o) => ({
          id: o.id,
          name: o.name.trim(),
          priceDeltaIdr: Number(o.price || '0'),
        })),
      })),
    }
    const result = await saveMenuItem(item?.id ?? null, input)
    setBusy(false)
    if (!result.ok) {
      setError(failureText(result, t))
      return
    }
    onSaved(t(hidden ? 'hidden' : 'itemSaved', { name: input.name }))
  }

  async function remove() {
    if (!item) return
    setBusy(true)
    const result = await api(`/api/manager/menu/${item.id}`, deleteResult, {
      method: 'DELETE',
    })
    setBusy(false)
    setConfirmDelete(false)
    if (!result.ok) {
      setError(failureText(result, t))
      return
    }
    onSaved(t('deleted', { name: item.name }))
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    void save(item?.hidden ?? false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={item ? t('editItem') : copyOf ? t('copyItem') : t('addItem')}
      wide
      footer={
        confirmDelete && item ? (
          <>
            <p className="mr-auto self-center text-[15px] font-medium">
              {t('deleteConfirm', { name: item.name })}
            </p>
            <Button variant="text" onClick={() => setConfirmDelete(false)}>
              {t('cancel')}
            </Button>
            <Button
              disabled={busy}
              icon={<Trash2 size={18} aria-hidden />}
              onClick={() => void remove()}
            >
              {t('delete')}
            </Button>
          </>
        ) : (
          <>
            <div className="mr-auto flex">
              {item && (
                <Button
                  variant="text"
                  icon={<Trash2 size={18} aria-hidden />}
                  aria-label={t('delete')}
                  disabled={busy}
                  onClick={() => {
                    setError(null)
                    setConfirmDelete(true)
                  }}
                >
                  <span className="hidden sm:inline">{t('delete')}</span>
                </Button>
              )}
              {item && onDuplicate && (
                <Button
                  variant="text"
                  icon={<Copy size={18} aria-hidden />}
                  aria-label={t('duplicate')}
                  disabled={busy}
                  onClick={() => onDuplicate(item)}
                >
                  <span className="hidden sm:inline">{t('duplicate')}</span>
                </Button>
              )}
              {item && !item.hidden && (
                <Button
                  variant="text"
                  icon={<EyeOff size={18} aria-hidden />}
                  aria-label={t('hide')}
                  disabled={busy}
                  onClick={() => void save(true)}
                >
                  <span className="hidden sm:inline">{t('hide')}</span>
                </Button>
              )}
            </div>
            <Button variant="text" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button type="submit" form="menu-item-form" disabled={busy}>
              {t('save')}
            </Button>
          </>
        )
      }
    >
      <form
        id="menu-item-form"
        onSubmit={submit}
        noValidate
        className="grid gap-2 pt-2"
      >
        <div className="grid gap-x-4 sm:grid-cols-[minmax(0,1fr)_11rem]">
          <TextField
            label={t('itemName')}
            max={MENU_LIMITS.name}
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={required(name)}
            autoComplete="off"
            autoFocus={!item}
          />
          <TextField
            label={t('price')}
            inputMode="numeric"
            autoComplete="off"
            value={price}
            onChange={(e) => setPrice(digits(e.target.value))}
            hint={priceIdr !== null ? formatIdr(priceIdr) : t('priceHint')}
            error={required(price)}
            className="tabular-nums"
          />
          <TextField
            label={t('category')}
            hint={t('categoryHint')}
            max={MENU_LIMITS.category}
            list="menu-categories"
            autoComplete="off"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            error={required(category)}
          />
          <datalist id="menu-categories">
            {categories.map((c) => (
              <option key={c} value={localizeMenuText(c, lang)} />
            ))}
          </datalist>
          <TextField
            label={t('sortOrder')}
            inputMode="numeric"
            autoComplete="off"
            value={sort}
            onChange={(e) => setSort(digits(e.target.value).slice(0, 5))}
            className="tabular-nums"
          />
        </div>
        <Switch
          label={t('available')}
          hint={t('availableHint')}
          checked={available}
          onChange={setAvailable}
        />

        <fieldset className="mt-4 grid gap-3">
          <legend className="text-lg font-medium">{t('modifiers')}</legend>
          <p className="text-[13px] text-ink-soft">{t('modifiersHint')}</p>
          {groups.map((group) => (
            <div
              key={group.id}
              className="rise grid gap-1 rounded-md bg-wash p-4 pb-2"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <TextField
                    label={t('groupName')}
                    max={MENU_LIMITS.name}
                    autoComplete="off"
                    value={group.name}
                    onChange={(e) =>
                      updateGroup(group.id, { name: e.target.value })
                    }
                    error={required(group.name)}
                  />
                </div>
                <IconButton
                  label={t('removeGroup')}
                  className="mt-6"
                  onClick={() =>
                    setGroups((list) => list.filter((g) => g.id !== group.id))
                  }
                >
                  <Trash2 size={20} aria-hidden />
                </IconButton>
              </div>
              <div className="flex flex-wrap gap-2 pb-3">
                <Chip
                  selected={group.required}
                  onClick={() =>
                    updateGroup(group.id, { required: !group.required })
                  }
                >
                  {t('required')}
                </Chip>
                <Chip
                  selected={group.multi}
                  onClick={() => updateGroup(group.id, { multi: !group.multi })}
                >
                  {t('chooseAny')}
                </Chip>
              </div>
              {group.options.map((option, index) => (
                <div
                  key={option.id}
                  className="rise grid grid-cols-[minmax(0,1fr)_8rem_auto] items-start gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto]"
                >
                  <TextField
                    label={t('optionName', { n: index + 1 })}
                    max={MENU_LIMITS.name}
                    autoComplete="off"
                    value={option.name}
                    onChange={(e) =>
                      updateOption(group, option.id, { name: e.target.value })
                    }
                    error={required(option.name)}
                  />
                  <TextField
                    label={t('priceDelta')}
                    inputMode="numeric"
                    autoComplete="off"
                    value={option.price}
                    onChange={(e) =>
                      updateOption(group, option.id, {
                        price: digits(e.target.value),
                      })
                    }
                    className="tabular-nums"
                  />
                  <IconButton
                    label={t('removeOption')}
                    className="mt-6"
                    disabled={group.options.length === 1}
                    onClick={() =>
                      updateGroup(group.id, {
                        options: group.options.filter(
                          (o) => o.id !== option.id,
                        ),
                      })
                    }
                  >
                    <X size={20} aria-hidden />
                  </IconButton>
                </div>
              ))}
              <Button
                variant="text"
                className="justify-self-start"
                icon={<Plus size={18} aria-hidden />}
                disabled={group.options.length >= MENU_LIMITS.options}
                onClick={() =>
                  updateGroup(group.id, {
                    options: [...group.options, newOption()],
                  })
                }
              >
                {t('addOption')}
              </Button>
            </div>
          ))}
          <Button
            variant="outlined"
            className="justify-self-start"
            icon={<Plus size={18} aria-hidden />}
            disabled={groups.length >= MENU_LIMITS.groups}
            onClick={() => setGroups((list) => [...list, newGroup()])}
          >
            {t('addGroup')}
          </Button>
        </fieldset>
        {error && (
          <p role="alert" className="mt-2 font-semibold">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  )
}
