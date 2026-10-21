import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { type History, historySchema } from '../../shared/history'
import { jakartaDate } from '../../shared/order'
import { useI18n } from '../i18n'
import { api } from '../lib/api'

export const jakartaToday = () => jakartaDate(Date.now())

/** One service day's orders and totals, loaded again whenever `day` changes. */
export function useDayHistory(day: string, notify: (text: string) => void) {
  const { t } = useI18n()
  const [history, setHistory] = useState<History | null>(null)

  const reload = useCallback(async () => {
    const r = await api(`/api/manager/history?day=${day}`, historySchema)
    if (r.ok) setHistory(r.data)
    else notify(t('networkError'))
  }, [day, notify, t])

  useEffect(() => {
    if (!day) return
    setHistory(null)
    void reload()
  }, [day, reload])

  return { history, reload }
}

/** Picks a service day, today at the latest. */
export function DayField({
  label,
  value,
  onChange,
}: {
  label: ReactNode
  value: string
  onChange: (day: string) => void
}) {
  return (
    <label className="flex items-center gap-3 text-sm font-medium">
      {label}
      <input
        type="date"
        value={value}
        max={jakartaToday()}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 rounded-sm border border-ink-soft bg-surface px-3 text-base outline-none focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--color-ink)]"
      />
    </label>
  )
}
