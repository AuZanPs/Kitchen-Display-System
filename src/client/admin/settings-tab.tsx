import { useState } from 'react'
import { z } from 'zod'
import { type Settings, settingsSchema } from '../../shared/board'
import { useI18n } from '../i18n'
import { api } from '../lib/api'
import { Card } from '../ui/card'
import { Switch } from '../ui/switch'
import { HistoryDeleteCard } from './history-delete'

const ROWS = [
  { key: 'lineNotes', label: 'settingLineNotes', hint: 'settingLineNotesHint' },
  { key: 'orderNote', label: 'settingOrderNote', hint: 'settingOrderNoteHint' },
  { key: 'allergy', label: 'settingAllergy', hint: 'settingAllergyHint' },
  { key: 'staffPins', label: 'settingStaffPins', hint: 'settingStaffPinsHint' },
] as const

/** Lets each venue choose a simple or a detailed order form. */
export function SettingsTab({
  settings,
  notify,
}: {
  settings: Settings | null
  notify: (text: string) => void
}) {
  const { t } = useI18n()
  // Shown until the board echoes the change back over the socket.
  const [pending, setPending] = useState<Settings | null>(null)
  const shown = pending ?? settings

  async function change(next: Settings) {
    setPending(next)
    const result = await api(
      '/api/admin/settings',
      z.object({ settings: settingsSchema }),
      {
        body: next,
      },
    )
    setPending(null)
    notify(result.ok ? t('settingsSaved') : t('networkError'))
  }

  return (
    <div className="grid max-w-2xl gap-6">
      <Card className="grid gap-2">
        <h2 className="text-2xl font-medium">{t('orderDetails')}</h2>
        <p className="mb-2 text-[15px] text-ink-soft">
          {t('orderDetailsHint')}
        </p>
        {shown && (
          <div className="grid divide-y divide-line">
            {ROWS.map((row) => (
              <Switch
                key={row.key}
                label={t(row.label)}
                hint={t(row.hint)}
                checked={shown[row.key]}
                disabled={pending !== null}
                onChange={(checked) =>
                  void change({ ...shown, [row.key]: checked })
                }
              />
            ))}
          </div>
        )}
      </Card>
      <HistoryDeleteCard notify={notify} />
    </div>
  )
}
