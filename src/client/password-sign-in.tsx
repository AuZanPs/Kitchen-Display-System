import { type SubmitEvent, useState } from 'react'
import { z } from 'zod'
import { BrandMark, LanguageToggle } from './app-bar'
import { useI18n } from './i18n'
import { type ApiResult, api } from './lib/api'
import { CenterNote } from './lib/session'
import { Button } from './ui/button'
import { TextField } from './ui/text-field'

type Failure = Extract<ApiResult<unknown>, { ok: false }>

/** The full-page password form the admin and the console sign in with. */
export function PasswordSignIn({
  title,
  endpoint,
  errorText,
  onSignedIn,
}: {
  title: string
  endpoint: string
  /** The words under the field when sign-in fails. */
  errorText: (result: Failure) => string
  onSignedIn: () => void
}) {
  const { t } = useI18n()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    const result = await api(endpoint, z.null(), { body: { password } })
    setBusy(false)
    if (result.ok) return onSignedIn()
    setError(errorText(result))
  }

  return (
    <CenterNote>
      <div className="fixed top-4 right-4">
        <LanguageToggle />
      </div>
      <form
        onSubmit={submit}
        className="grid w-[min(24rem,calc(100vw-3rem))] gap-6 text-left"
      >
        <div className="grid gap-5">
          <span
            translate="no"
            className="flex items-center gap-3 text-lg font-semibold"
          >
            <BrandMark />
            {t('appName')}
          </span>
          <h1 className="text-4xl font-semibold tracking-tight">{title}</h1>
        </div>
        <TextField
          label={t('password')}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            setError(null)
          }}
          error={error}
          required
          autoFocus
        />
        <Button type="submit" size="lg" disabled={busy || password === ''}>
          {t('signIn')}
        </Button>
      </form>
    </CenterNote>
  )
}
