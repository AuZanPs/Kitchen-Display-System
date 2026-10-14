// TEMP-AUTH: asks for the shared dev key until real device enrollment exists.
import { type ReactNode, type SubmitEvent, useEffect, useState } from 'react'

type GateState = 'checking' | 'locked' | 'open'

export function DevKeyGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>('checking')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/dev/session', { signal: controller.signal })
      .then((res) => setState(res.ok ? 'open' : 'locked'))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Network error')
        setState('locked')
      })
    return () => controller.abort()
  }, [])

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const key = new FormData(event.currentTarget).get('key')
    if (typeof key !== 'string' || key === '') return
    setError(null)
    try {
      const res = await fetch('/api/dev/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key }),
      })
      if (res.ok) setState('open')
      else setError('Wrong key')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    }
  }

  if (state === 'open') return children
  if (state === 'checking') return <p className="dev-gate">Checking access…</p>

  return (
    <form className="dev-gate" onSubmit={handleSubmit}>
      <label htmlFor="dev-key">Dev key</label>
      <input
        id="dev-key"
        name="key"
        type="password"
        autoComplete="off"
        required
      />
      <button type="submit">Unlock</button>
      {error && <p role="alert">{error}</p>}
    </form>
  )
}
