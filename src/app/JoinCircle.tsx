/**
 * §8.4 Join a circle.
 *
 * One field for the code, or pre-filled from the deeplink's `?join=`. Then the
 * full terms before anyone commits: name, share, frequency, members, the whole
 * rotation order, and the seat this member would take, because when their
 * turn comes is the entire reason they are joining.
 *
 * A forming circle has no start date yet: round 1 opens the moment the last
 * seat fills. So the turn is shown relative to that start, in whole periods,
 * rather than as a calendar date that would be invented.
 */
import { useEffect, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { Field } from '../components/Field'
import { Ring } from '../components/Ring'
import { StatStrip } from '../components/StatStrip'
import { CircleFull, CouldNotReach } from './states'
import { ApiError, api, type CircleView } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { link, rememberName, rememberedName, walletAddress } from '../lib/identity'

const CODE_ERRORS = new Set(['CODE_NOT_FOUND', 'CODE_MALFORMED'])
const FULL_ERRORS = new Set(['CIRCLE_FULL', 'CIRCLE_CLOSED_TO_JOINS'])
const MAX_MEMBER_NAME = 40

type Phase =
  | { kind: 'enter'; notFound: boolean }
  | { kind: 'finding' }
  | { kind: 'lookupFailed' }
  | { kind: 'terms'; view: CircleView }
  | { kind: 'wallet'; view: CircleView }
  | { kind: 'joining'; view: CircleView }
  | { kind: 'addressDeclined'; view: CircleView }
  | { kind: 'joinFailed'; view: CircleView }
  | { kind: 'full'; memberCount: number }

/** A code pasted from a message may carry spaces, dashes or lower case. */
const normalise = (raw: string) => raw.toUpperCase().replace(/[^0-9A-Z]/g, '')

export function JoinCircle({ initialCode, deviceId }: { initialCode: string | null; deviceId: string }) {
  const { t, format } = useI18n()
  const qc = useQueryClient()
  const [code, setCode] = useState(initialCode ? normalise(initialCode) : '')
  const [yourName, setYourName] = useState(rememberedName)
  const [nameError, setNameError] = useState<string | undefined>()
  const [phase, setPhase] = useState<Phase>(initialCode ? { kind: 'finding' } : { kind: 'enter', notFound: false })

  const open = (circleCode: string) => location.assign(link({ code: circleCode }))

  async function find(value: string) {
    const target = normalise(value)
    setPhase({ kind: 'finding' })
    try {
      const view = await api.readCircle(target, deviceId)
      // Already seated here: there is nothing to join, only a circle to open.
      if (view.you) return open(view.circle.code)
      if (view.circle.status !== 'forming') {
        return setPhase({ kind: 'full', memberCount: view.circle.memberCount })
      }
      setPhase({ kind: 'terms', view })
    } catch (error) {
      if (error instanceof ApiError && CODE_ERRORS.has(error.code)) {
        return setPhase({ kind: 'enter', notFound: true })
      }
      setPhase({ kind: 'lookupFailed' })
    }
  }

  async function join(view: CircleView) {
    if (!yourName.trim()) return setNameError(t.create.needYourName)

    setPhase({ kind: 'wallet', view })
    let address: string
    try {
      address = await walletAddress()
    } catch {
      return setPhase({ kind: 'addressDeclined', view })
    }

    setPhase({ kind: 'joining', view })
    try {
      await api.joinCircle(view.circle.code, { displayName: yourName.trim(), address }, deviceId)
      rememberName(yourName)
      void qc.invalidateQueries({ queryKey: ['circles'] })
      open(view.circle.code)
    } catch (error) {
      if (error instanceof ApiError && FULL_ERRORS.has(error.code)) {
        const count = Number(error.details.memberCount) || view.circle.memberCount
        return setPhase({ kind: 'full', memberCount: count })
      }
      if (error instanceof ApiError && CODE_ERRORS.has(error.code)) {
        return setPhase({ kind: 'enter', notFound: true })
      }
      setPhase({ kind: 'joinFailed', view })
    }
  }

  // Arriving from the deeplink: look the code up straight away.
  useEffect(() => {
    if (initialCode) void find(initialCode)
    // Only on arrival; later lookups come from the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (phase.kind === 'full') return <CircleFull memberCount={phase.memberCount} backHref={link()} />

  if (phase.kind === 'enter' || phase.kind === 'finding' || phase.kind === 'lookupFailed') {
    const submit = (event: FormEvent) => {
      event.preventDefault()
      if (normalise(code)) void find(code)
    }
    return (
      <Shell>
        <Back />
        <h1 className="text-title tracking-title">{t.join.title}</h1>
        <form className="mt-5 flex flex-col gap-5" onSubmit={submit} noValidate>
          <Field
            label={t.join.code}
            value={code}
            mono
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={12}
            hint={t.join.codeHint}
            // §11, verbatim: "That code does not match a circle."
            error={phase.kind === 'enter' && phase.notFound ? t.states.codeNotFound.line : undefined}
            onChange={(e) => {
              setCode(e.target.value)
              if (phase.kind === 'enter' && phase.notFound) setPhase({ kind: 'enter', notFound: false })
            }}
          />
          {phase.kind === 'lookupFailed' ? (
            <CouldNotReach context="general" layout="inline" onRetry={() => void find(code)} />
          ) : (
            <Button full type="submit" disabled={phase.kind === 'finding'}>
              {phase.kind === 'finding' ? t.join.finding : t.join.find}
            </Button>
          )}
        </form>
      </Shell>
    )
  }

  const { view } = phase
  const { circle, members } = view
  const yourSeat = members.length + 1
  const busy = phase.kind === 'wallet' || phase.kind === 'joining'

  return (
    <Shell>
      <Back />
      <h1 className="text-title tracking-title">{circle.name}</h1>

      <div className="mt-3">
        <StatStrip
          stats={[
            { label: t.word.share, value: `${format.plain(circle.shareNim)} ${circle.currency}` },
            { label: t.create.frequency, value: t.word[circle.frequency] },
            { label: t.word.members, value: `${members.length} / ${circle.memberCount}` },
          ]}
        />
      </div>

      <div className="flex justify-center my-6">
        <Ring
          total={circle.memberCount}
          current={0}
          you={yourSeat}
          pot={format.plain(circle.potNim)}
          currency={circle.currency}
        />
      </div>

      <section className="rounded-[var(--radius-card)] bg-raised p-4">
        <p className="text-card text-cream">{t.join.yourTurn(yourSeat, circle.totalRounds)}</p>
        <p className="text-body text-muted mt-1">{t.join.when(yourSeat - 1, circle.frequency)}</p>
        <p className="text-body text-muted">{t.join.startsWhenFull(circle.seatsRemaining)}</p>
      </section>

      <section className="mt-5">
        <p className="label mb-2">{t.join.rotation}</p>
        <div className="rounded-[var(--radius-card)] bg-surface divide-y divide-hairline overflow-hidden">
          {Array.from({ length: circle.memberCount }, (_, index) => {
            const position = index + 1
            const seated = members.find((m) => m.position === position)
            const isYours = position === yourSeat
            return (
              <div key={position} className="flex items-center gap-3 px-4 min-h-[var(--row-pitch)]">
                <span className="num text-body text-muted w-5 shrink-0">{position}</span>
                <span className={`text-card truncate ${seated || isYours ? 'text-cream' : 'text-muted'}`}>
                  {seated
                    ? seated.displayName
                    : isYours
                      ? yourName.trim()
                        ? `${yourName.trim()} · ${t.word.you}`
                        : t.word.you.charAt(0).toUpperCase() + t.word.you.slice(1)
                      : t.join.openSeat}
                </span>
              </div>
            )
          })}
        </div>
      </section>

      <div className="mt-5 flex flex-col gap-5">
        <Field
          label={t.create.yourName}
          value={yourName}
          maxLength={MAX_MEMBER_NAME}
          autoComplete="nickname"
          hint={t.create.yourNameHint}
          error={nameError}
          onChange={(e) => {
            setYourName(e.target.value)
            setNameError(undefined)
          }}
        />

        {phase.kind === 'addressDeclined' && (
          <EmptyState
            layout="inline"
            title={t.wallet.addressTitle}
            line={t.wallet.addressLine}
            action={{ label: t.wallet.addressAction, onClick: () => void join(view) }}
          />
        )}
        {phase.kind === 'joinFailed' && (
          <CouldNotReach context="general" layout="inline" onRetry={() => void join(view)} />
        )}
        {phase.kind !== 'addressDeclined' && phase.kind !== 'joinFailed' && (
          <Button full onClick={() => void join(view)} disabled={busy}>
            {phase.kind === 'wallet' ? t.pay.working : phase.kind === 'joining' ? t.join.joining : t.join.submit}
          </Button>
        )}

        <p className="text-body text-muted">{t.disclosure}</p>

        <button
          type="button"
          className="label self-center min-h-[44px] px-3"
          onClick={() => {
            setCode('')
            setPhase({ kind: 'enter', notFound: false })
          }}
        >
          {t.join.another}
        </button>
      </div>
    </Shell>
  )
}

function Back() {
  const { t } = useI18n()
  return (
    <a href={link()} className="label inline-block mb-3 hover:text-cream">
      &larr; {t.word.circles}
    </a>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-ground text-cream font-ui px-4 py-6 max-w-[430px] mx-auto">{children}</main>
  )
}
