import { useEffect } from 'react'

/**
 * Keeps the screen on while the page is visible. The browser drops the lock
 * whenever the page is hidden, so it is asked for again on every return.
 */
export function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null
    let stopped = false

    async function request() {
      if (document.visibilityState !== 'visible' || !('wakeLock' in navigator))
        return
      try {
        lock = await navigator.wakeLock.request('screen')
        if (stopped) void lock.release()
      } catch {
        // Refused (battery saver, insecure page): the screen may dim.
      }
    }

    void request()
    document.addEventListener('visibilitychange', request)
    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', request)
      void lock?.release()
    }
  }, [])
}
