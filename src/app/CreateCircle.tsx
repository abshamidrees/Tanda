/**
 * §8.3 Create a circle. Four fields and a live summary.
 *
 * Two additions the brief does not list, both required: the creator's own name
 * (every member row shows one, and the API cannot seat a nameless member), and
 * one muted data-disclosure line, which §21 requires wherever data is stored.
 * The name is remembered on this device so it is typed once.
 *
 * Reading the creator's address is a wallet action: Nimiq Pay asks before
 * sharing it (§10). Codes are generated on the server, so nothing here needs
 * crypto.randomUUID(), which plain-HTTP mini app loading does not provide.
 */
import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { Field } from '../components/Field'
import { Back } from './Back'
import { InviteShare } from './InviteShare'
import { CouldNotReach } from './states'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { rememberName, rememberedName, walletAddress } from '../lib/identity'

const MIN_MEMBERS = 3
const MAX_MEMBERS = 12
/** The server's own limits (server/router.ts), so a valid form is never refused. */
const MAX_NAME = 60
const MAX_MEMBER_NAME = 40

/** "500", "500.5" and the Spanish "500,5". At most five decimals: a Luna is 0.00001 NIM. */
function parseShare(raw: string): number | null {
  const text = raw.trim().replace(',', '.')
  if (!/^\d+(\.\d{1,5})?$/.test(text)) return null
  const value = Number(text)
  return value > 0 && Number.isFinite(value) ? value : null
}

type Phase =
  | { kind: 'form' }
  | { kind: 'wallet' }
  | { kind: 'creating' }
  | { kind: 'addressDeclined' }
  | { kind: 'failed' }
  | { kind: 'created'; code: string; name: string }

type Errors = Partial<Record<'name' | 'share' | 'yourName', string>>

export function CreateCircle({ deviceId }: { deviceId: string }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [share, setShare] = useState('')
  const [frequency, setFrequency] = useState<'weekly' | 'monthly'>('weekly')
  const [members, setMembers] = useState(6)
  const [yourName, setYourName] = useState(rememberedName)
  const [errors, setErrors] = useState<Errors>({})
  const [phase, setPhase] = useState<Phase>({ kind: 'form' })

  const shareNim = parseShare(share)
  const pot = (shareNim ?? 0) * members

  async function submit(event?: FormEvent) {
    event?.preventDefault()
    const next: Errors = {}
    if (!name.trim()) next.name = t.create.needName
    if (shareNim === null) next.share = t.create.needShare
    if (!yourName.trim()) next.yourName = t.create.needYourName
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setPhase({ kind: 'wallet' })
    let address: string
    try {
      address = await walletAddress()
    } catch {
      setPhase({ kind: 'addressDeclined' })
      return
    }

    setPhase({ kind: 'creating' })
    try {
      const view = await api.createCircle(
        { name: name.trim(), shareNim: shareNim!, frequency, memberCount: members, displayName: yourName.trim(), address },
        deviceId,
      )
      rememberName(yourName)
      void qc.invalidateQueries({ queryKey: ['circles'] })
      setPhase({ kind: 'created', code: view.circle.code, name: view.circle.name })
    } catch {
      setPhase({ kind: 'failed' })
    }
  }

  if (phase.kind === 'created') {
    return (
      <Shell>
        <Back />
        <h1 className="text-title tracking-title mb-5">{t.invite.title}</h1>
        <InviteShare name={phase.name} code={phase.code} />
      </Shell>
    )
  }

  const busy = phase.kind === 'wallet' || phase.kind === 'creating'

  return (
    <Shell>
      <Back />
      <h1 className="text-title tracking-title">{t.create.title}</h1>

      <form className="mt-5 flex flex-col gap-5" onSubmit={submit} noValidate>
        <Field
          label={t.create.name}
          value={name}
          maxLength={MAX_NAME}
          autoComplete="off"
          error={errors.name}
          onChange={(e) => {
            setName(e.target.value)
            setErrors((x) => ({ ...x, name: undefined }))
          }}
        />

        <Field
          label={t.create.share}
          value={share}
          inputMode="decimal"
          mono
          suffix="NIM"
          placeholder="500"
          autoComplete="off"
          error={errors.share}
          onChange={(e) => {
            setShare(e.target.value)
            setErrors((x) => ({ ...x, share: undefined }))
          }}
        />

        <div>
          <p className="label mb-2" id="frequency-label">
            {t.create.frequency}
          </p>
          <div
            role="radiogroup"
            aria-labelledby="frequency-label"
            className="grid grid-cols-2 gap-1 rounded-[var(--radius-field)] bg-surface border border-hairline p-1"
          >
            {(['weekly', 'monthly'] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={frequency === option}
                onClick={() => setFrequency(option)}
                className={`min-h-[44px] rounded-[var(--radius-field)] text-card ${
                  frequency === option ? 'bg-raised text-cream' : 'text-muted'
                }`}
              >
                {t.word[option]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="label mb-2" id="members-label">
            {t.create.members}
          </p>
          <div
            className="flex items-center justify-between rounded-[var(--radius-field)] bg-raised border border-hairline p-1"
            aria-labelledby="members-label"
          >
            <StepButton
              label={t.create.fewer}
              onClick={() => setMembers((m) => Math.max(MIN_MEMBERS, m - 1))}
              disabled={members <= MIN_MEMBERS}
            >
              −
            </StepButton>
            <span className="num text-card text-cream" aria-live="polite">
              {members}
            </span>
            <StepButton
              label={t.create.more}
              onClick={() => setMembers((m) => Math.min(MAX_MEMBERS, m + 1))}
              disabled={members >= MAX_MEMBERS}
            >
              +
            </StepButton>
          </div>
          <p className="text-body text-muted mt-1">{t.create.range(MIN_MEMBERS, MAX_MEMBERS)}</p>
        </div>

        {/* §8.3: always visible, recomputing as they type. Muted until there is a share to compute from. */}
        <div
          className={`rounded-[var(--radius-card)] bg-raised px-4 py-3 text-body ${
            shareNim === null ? 'text-muted' : 'text-cream'
          }`}
          aria-live="polite"
        >
          <p className="text-balance">{t.closing.eachPays(shareNim ?? 0, members, pot)}</p>
          <p className="mt-1">{t.closing.eachReceives(pot)}</p>
          <p className={`mt-1 ${shareNim === null ? '' : 'text-mint'}`}>{t.closing.endsSquare}</p>
        </div>

        <Field
          label={t.create.yourName}
          value={yourName}
          maxLength={MAX_MEMBER_NAME}
          autoComplete="nickname"
          hint={t.create.yourNameHint}
          error={errors.yourName}
          onChange={(e) => {
            setYourName(e.target.value)
            setErrors((x) => ({ ...x, yourName: undefined }))
          }}
        />

        {phase.kind === 'addressDeclined' && (
          <EmptyState
            layout="inline"
            title={t.wallet.addressTitle}
            line={t.wallet.addressLine}
            action={{ label: t.wallet.addressAction, onClick: () => submit() }}
          />
        )}
        {phase.kind === 'failed' && (
          <CouldNotReach context="general" layout="inline" onRetry={() => submit()} />
        )}

        {phase.kind !== 'addressDeclined' && phase.kind !== 'failed' && (
          <Button full type="submit" disabled={busy}>
            {phase.kind === 'wallet' ? t.pay.working : phase.kind === 'creating' ? t.create.creating : t.create.submit}
          </Button>
        )}

        <p className="text-body text-muted">{t.disclosure}</p>
      </form>
    </Shell>
  )
}

function StepButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled: boolean
  children: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="num min-h-[44px] min-w-[44px] rounded-[var(--radius-field)] text-title text-cream disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-ground text-cream font-ui px-4 py-6 max-w-[430px] mx-auto">{children}</main>
  )
}
