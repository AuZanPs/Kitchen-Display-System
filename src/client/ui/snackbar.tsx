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
      // Pages with bottom bars raise it through --snackbar-bottom.
      className="pointer-events-none fixed inset-x-0 bottom-[var(--snackbar-bottom,1.5rem)] z-50 flex justify-center px-4"
    >
      {message && (
        <p
          key={message.id}
          className="rise pointer-events-none max-w-lg rounded-sm bg-ink px-5 py-3.5 text-[15px] font-medium text-surface"
        >
          {message.text}
        </p>
      )}
    </div>
  )
  return { show, node }
}
