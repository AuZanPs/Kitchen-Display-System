import { Minus, NotebookPen, Plus, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import type { Settings } from '../../shared/board'
import { chooseOptions, type MenuItem } from '../../shared/menu'
import { LIMITS } from '../../shared/order'
import { formatIdr, useI18n } from '../i18n'
import { uuid } from '../lib/uuid'
import { Button, IconButton } from '../ui/button'
import { Chip } from '../ui/chip'
import { Dialog } from '../ui/dialog'
import { TextArea } from '../ui/text-field'
import type { DraftLine } from './draft'

/** Configures one line: quantity, options, note and a separate allergy field. */
export function ItemDialog({
  item,
  initial,
  settings,
  onClose,
  onSave,
}: {
  item: MenuItem
  settings: Settings
  initial: DraftLine | null
  onClose: () => void
  onSave: (line: DraftLine) => void
}) {
  const { t } = useI18n()
  const [qty, setQty] = useState(initial?.qty ?? 1)
  const [optionIds, setOptionIds] = useState<string[]>(initial?.optionIds ?? [])
  const [note, setNote] = useState(initial?.note ?? '')
  const [allergy, setAllergy] = useState(initial?.allergy ?? '')
  const [showErrors, setShowErrors] = useState(false)

  const chosen = chooseOptions(item.modifierGroups, optionIds)
  const tooLong =
    note.trim().length > LIMITS.lineNote ||
    allergy.trim().length > LIMITS.allergy
  const unitPrice = item.priceIdr + (chosen.ok ? chosen.priceDeltaIdr : 0)

  function toggle(groupId: string, optionId: string, multi: boolean) {
    const group = item.modifierGroups.find((g) => g.id === groupId)
    const inGroup = new Set(group?.options.map((o) => o.id))
    setOptionIds((ids) => {
      if (ids.includes(optionId)) return ids.filter((id) => id !== optionId)
      return multi
        ? [...ids, optionId]
        : [...ids.filter((id) => !inGroup.has(id)), optionId]
    })
  }

  function save() {
    if (!chosen.ok || tooLong) {
      setShowErrors(true)
      return
    }
    onSave({
      key: initial?.key ?? uuid(),
      menuItemId: item.id,
      name: item.name,
      qty,
      optionIds,
      modifierNames: chosen.names,
      note: note.trim(),
      allergy: allergy.trim(),
      unitPriceIdr: unitPrice,
    })
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={item.name}
      description={formatIdr(item.priceIdr)}
      footer={
        <div className="flex w-full items-center gap-4">
          <div className="mr-auto flex items-center rounded-full bg-tonal">
            <IconButton
              label="-1"
              disabled={qty <= 1}
              onClick={() => setQty((q) => q - 1)}
            >
              <Minus size={20} aria-hidden />
            </IconButton>
            <output
              className="w-8 text-center text-lg font-semibold tabular-nums"
              aria-label={t('qty')}
            >
              {qty}
            </output>
            <IconButton
              label="+1"
              disabled={qty >= LIMITS.qty}
              onClick={() => setQty((q) => q + 1)}
            >
              <Plus size={20} aria-hidden />
            </IconButton>
          </div>
          <Button size="lg" onClick={save}>
            {initial ? t('saveLine') : t('addToOrder')} ·{' '}
            {formatIdr(unitPrice * qty)}
          </Button>
        </div>
      }
    >
      <div className="grid gap-6 pt-2">
        {item.modifierGroups.map((group) => {
          const missing =
            showErrors &&
            group.required &&
            !group.options.some((o) => optionIds.includes(o.id))
          return (
            <fieldset key={group.id} className="grid gap-2.5">
              <legend className="mb-2.5 flex items-center gap-2 text-[15px] font-medium">
                {group.name}
                <span className="text-[13px] font-normal text-ink-soft">
                  {group.required
                    ? t('required')
                    : group.multi
                      ? t('chooseAny')
                      : t('chooseOne')}
                </span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {group.options.map((option) => (
                  <Chip
                    key={option.id}
                    selected={optionIds.includes(option.id)}
                    onClick={() => toggle(group.id, option.id, group.multi)}
                  >
                    {option.name}
                    {option.priceDeltaIdr > 0 && (
                      <span className="text-ink-soft">
                        +{formatIdr(option.priceDeltaIdr)}
                      </span>
                    )}
                  </Chip>
                ))}
              </div>
              {missing && (
                <p role="alert" className="text-[13px] font-semibold">
                  {t('required')}: {group.name}
                </p>
              )}
            </fieldset>
          )
        })}
        {settings.lineNotes && (
          <TextArea
            label={t('note')}
            icon={<NotebookPen size={16} aria-hidden />}
            max={LIMITS.lineNote}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        )}
        {settings.allergy && (
          <TextArea
            label={t('allergy')}
            icon={<ShieldAlert size={16} aria-hidden />}
            hint={t('allergyHint')}
            max={LIMITS.allergy}
            value={allergy}
            onChange={(e) => setAllergy(e.target.value)}
          />
        )}
      </div>
    </Dialog>
  )
}
