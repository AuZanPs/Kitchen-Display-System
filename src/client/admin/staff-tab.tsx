import { ChefHat, ConciergeBell, LoaderCircle, Plus } from 'lucide-react'
import { type SubmitEvent, useCallback, useEffect, useState } from 'react'
import { z } from 'zod'
import {
  type AdminStaff,
  adminStaffListSchema,
  adminStaffSchema,
  pinSchema,
  STAFF_ROLES,
} from '../../shared/staff'
import { useI18n } from '../i18n'
import { api } from '../lib/api'
import { failureText } from '../lib/commands'
import { stagger } from '../lib/stagger'
import { Monogram } from '../staff-sign-in'
import { Button } from '../ui/button'
import { Dialog } from '../ui/dialog'
import { Switch } from '../ui/switch'
import { TextField } from '../ui/text-field'
import { useEditing } from './shared'

type StaffRole = (typeof STAFF_ROLES)[number]
const ROLE_ICON = { waiter: ConciergeBell, kitchen: ChefHat } as const
const ROLE_KEY = {
  waiter: 'staffRoleWaiter',
  kitchen: 'staffRoleKitchen',
} as const

export function StaffTab({ notify }: { notify: (text: string) => void }) {
  const { t } = useI18n()
  const [staff, setStaff] = useState<AdminStaff[] | null>(null)
  const editing = useEditing<AdminStaff>()

  const load = useCallback(async () => {
    const result = await api('/api/manager/staff', adminStaffListSchema)
    if (result.ok) setStaff(result.data.staff)
    else notify(t('networkError'))
  }, [notify, t])

  useEffect(() => {
    void load()
  }, [load])

  let index = 0
  return (
    <section aria-labelledby="staff" className="grid max-w-3xl gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="staff" className="text-2xl font-medium">
          {t('staffTitle')}
        </h2>
        <Button
          icon={<Plus size={18} aria-hidden />}
          onClick={() => editing.start(null)}
        >
          {t('addStaff')}
        </Button>
      </div>
      {staff === null && (
        <LoaderCircle
          className="animate-spin text-ink-soft"
          size={28}
          aria-label={t('loading')}
        />
      )}
      {staff && staff.length === 0 && (
        <p className="text-ink-soft">{t('noStaff')}</p>
      )}
      {STAFF_ROLES.map((role) => {
        const rows = staff?.filter((s) => s.role === role) ?? []
        if (rows.length === 0) return null
        const Icon = ROLE_ICON[role]
        return (
          <div key={role} className="grid gap-2">
            <h3 className="flex items-center gap-2 px-1 text-sm font-medium text-ink-soft">
              <Icon size={16} aria-hidden />
              {t(ROLE_KEY[role])}
            </h3>
            <ul className="grid gap-2">
              {rows.map((member) => (
                <li key={member.id} style={stagger(index++)} className="rise">
                  <button
                    type="button"
                    onClick={() => editing.start(member)}
                    className={`state flex min-h-16 w-full items-center gap-4 rounded-md px-4 py-2 text-left ${member.disabled ? 'border border-dashed border-ink-soft' : '[--bg:var(--color-wash)]'}`}
                  >
                    <Monogram name={member.name} muted={member.disabled} />
                    <span className="mr-auto grid min-w-0">
                      <span
                        className={`font-medium break-words ${member.disabled ? 'text-ink-soft' : ''}`}
                      >
                        {member.name}
                      </span>
                      {(!member.hasPin || member.disabled) && (
                        <span className="text-sm text-ink-soft">
                          {member.disabled ? t('staffDisabled') : t('noPin')}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
      <StaffDialog
        key={editing.key}
        open={editing.open}
        member={editing.target}
        onClose={editing.close}
        onSaved={(name) => {
          editing.close()
          notify(t('itemSaved', { name }))
          void load()
        }}
      />
    </section>
  )
}

function StaffDialog({
  open,
  member,
  onClose,
  onSaved,
}: {
  open: boolean
  member: AdminStaff | null
  onClose: () => void
  onSaved: (name: string) => void
}) {
  const { t } = useI18n()
  const [name, setName] = useState(member?.name ?? '')
  const [role, setRole] = useState<StaffRole>(member?.role ?? 'waiter')
  const [pin, setPin] = useState('')
  const [active, setActive] = useState(!(member?.disabled ?? false))
  const [error, setError] = useState<string | null>(null)
  const [pinError, setPinError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // A new person needs a PIN; an existing one keeps theirs when left empty.
  const pinOk =
    pinSchema.safeParse(pin).success || (pin === '' && member?.hasPin === true)

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (name.trim() === '') return setError(t('fieldRequired'))
    if (name.length > 40) {
      return setError(t('tooLong', { count: name.length, max: 40 }))
    }
    if (!pinOk) return setPinError(t('pinNeeded'))
    setBusy(true)
    const body = {
      name: name.trim(),
      role,
      disabled: !active,
      ...(pin ? { pin } : {}),
    }
    const result = member
      ? await api(
          `/api/manager/staff/${member.id}`,
          z.object({ staff: adminStaffSchema }),
          { method: 'PUT', body },
        )
      : await api('/api/manager/staff', z.object({ staff: adminStaffSchema }), {
          body,
        })
    setBusy(false)
    if (!result.ok) {
      setError(failureText(result, t))
      return
    }
    onSaved(result.data.staff.name)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={member ? t('editStaff') : t('addStaff')}
      footer={
        <>
          <Button variant="text" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" form="staff-form" disabled={busy}>
            {t('save')}
          </Button>
        </>
      }
    >
      <form
        id="staff-form"
        onSubmit={submit}
        noValidate
        className="grid gap-3 pt-2"
      >
        <TextField
          label={t('staffName')}
          max={40}
          autoComplete="off"
          autoFocus={!member}
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
          error={error}
        />
        <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">{t('role')}</legend>
          <div className="grid grid-cols-2 overflow-hidden rounded-full border border-ink-soft">
            {STAFF_ROLES.map((r) => {
              const Icon = ROLE_ICON[r]
              return (
                <label
                  key={r}
                  className={`flex min-h-12 cursor-pointer items-center justify-center gap-2 border-ink-soft px-2 text-sm font-medium transition-colors duration-150 not-first:border-l has-focus-visible:outline-3 has-focus-visible:-outline-offset-4 has-focus-visible:outline-ink ${role === r ? 'bg-tonal' : ''}`}
                >
                  <input
                    type="radio"
                    name="staff-role"
                    value={r}
                    checked={role === r}
                    onChange={() => setRole(r)}
                    className="sr-only"
                  />
                  <Icon size={18} aria-hidden />
                  {t(ROLE_KEY[r])}
                </label>
              )
            })}
          </div>
        </fieldset>
        <TextField
          label={t('pin')}
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          hint={member?.hasPin ? t('pinKeepHint') : t('pinHint')}
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, '').slice(0, 6))
            setPinError(null)
          }}
          error={pinError}
          className="tracking-[0.3em] tabular-nums"
        />
        <Switch
          label={t('staffActive')}
          hint={t('staffActiveHint')}
          checked={active}
          onChange={setActive}
        />
      </form>
    </Dialog>
  )
}
