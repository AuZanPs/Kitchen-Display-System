import * as RadixDialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useI18n } from '../i18n'
import { IconButton } from './button'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  wide = false,
}: Props) {
  const { t } = useI18n()
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="dialog-overlay fixed inset-0 z-40 bg-ink/40" />
        <RadixDialog.Content
          className={`dialog-content fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full flex-col rounded-t-lg bg-surface sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg ${wide ? 'sm:max-w-3xl' : 'sm:max-w-xl'}`}
        >
          <header className="flex items-start gap-3 px-6 pt-6 pb-2">
            <div className="grid flex-1 gap-1">
              <RadixDialog.Title className="text-2xl font-semibold tracking-tight">
                {title}
              </RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="text-[15px] text-ink-soft">
                  {description}
                </RadixDialog.Description>
              ) : (
                <RadixDialog.Description className="sr-only">
                  {title}
                </RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close asChild>
              <IconButton label={t('close')} className="-mt-1 -mr-2">
                <X size={22} aria-hidden />
              </IconButton>
            </RadixDialog.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-4">
            {children}
          </div>
          {footer && (
            <footer className="flex flex-wrap justify-end gap-3 border-t border-line px-6 py-4">
              {footer}
            </footer>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
