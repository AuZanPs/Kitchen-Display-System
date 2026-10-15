import { useCallback, useEffect, useState } from 'react'

const SHOW_MS = 4_000

/** One message at a time, announced politely and gone after four seconds. */
export function useSnackbar() {
  const [message, setMessage] = useState<{ text: string; id: number } | null>(
    null,
  )
  const show = useCallback(
    (text: string) => setMessage({ text, id: Date.now() }),
    [],
  )

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), SHOW_MS)
    return () => clearTimeout(timer)
  }, [message])

  const node = (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 sm:bottom-6"
    >
      {message && (
        <p
          key={message.id}
          className="dialog-content max-w-lg rounded-sm bg-ink px-5 py-3.5 text-[15px] font-medium text-surface"
          data-state="open"
        >
          {message.text}
        </p>
      )}
    </div>
  )
  return { show, node }
}
