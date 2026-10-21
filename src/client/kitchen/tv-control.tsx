import { ChevronLeft, ChevronRight, MonitorPlay } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import type { TvControl as Control, TvAction } from '../../shared/board'
import { useI18n } from '../i18n'
import { api } from '../lib/api'
import { failureText } from '../lib/commands'
import { IconButton } from '../ui/button'
import { Dialog } from '../ui/dialog'
import { Switch } from '../ui/switch'

/** Lets the kitchen stop the TV's page rotation and step through pages. */
export function TvControl({
  control,
  notify,
}: {
  control: Control | undefined
  notify: (text: string) => void
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const page = control?.page ?? 0
  const paused = control?.paused ?? false

  async function post(body: TvAction) {
    const result = await api('/api/tv/control', z.unknown(), { body })
    if (!result.ok) notify(failureText(result, t))
  }

  return (
    <>
      <IconButton label={t('tvControlTitle')} onClick={() => setOpen(true)}>
        <MonitorPlay size={22} aria-hidden />
      </IconButton>
      <Dialog open={open} onOpenChange={setOpen} title={t('tvControlTitle')}>
        <div className="grid gap-2 pb-2">
          <Switch
            label={t('tvRotate')}
            hint={t('tvRotateHint')}
            checked={!paused}
            disabled={!control}
            onChange={(on) => void post({ action: on ? 'resume' : 'pause' })}
          />
          <div className="flex items-center justify-between gap-3 rounded-md bg-wash p-2">
            <IconButton
              label={t('prevPage')}
              disabled={!paused || page === 0}
              onClick={() => void post({ action: 'page', page: page - 1 })}
            >
              <ChevronLeft size={24} aria-hidden />
            </IconButton>
            <span
              className={`text-lg font-medium tabular-nums ${paused ? '' : 'text-ink-soft'}`}
            >
              {t('tvPage', { n: page + 1 })}
            </span>
            <IconButton
              label={t('nextPage')}
              disabled={!paused}
              onClick={() => void post({ action: 'page', page: page + 1 })}
            >
              <ChevronRight size={24} aria-hidden />
            </IconButton>
          </div>
          {!paused && (
            <p className="text-[13px] text-ink-soft">{t('tvPageHint')}</p>
          )}
        </div>
      </Dialog>
    </>
  )
}
