/**
 * §8.6 Pay your share.
 *
 * Recipient, exact amount, round. One button. On return: the hash is recorded
 * and the row goes to a pending mint state. On cancellation: this sheet stays
 * open saying so, and nothing anywhere claims a payment happened.
 */
import { useState, type ReactNode } from 'react'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { Sheet } from '../components/Sheet'
import { CouldNotReach, InsufficientBalance, PaymentCancelled } from './states'
import { api, clearUnreported, isRefusal, type CircleView, type ShareRow } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { payShare, type PayFailure } from '../lib/pay'

type Phase =
  | { kind: 'idle' }
  | { kind: 'waiting' }
  | { kind: 'recording' }
  | { kind: 'failed'; failure: PayFailure }

export function PaySheet({
  open,
  onClose,
  circle,
  share,
  deviceId,
  onPaid,
  onSettledElsewhere,
}: {
  open: boolean
  onClose: () => void
  circle: CircleView
  share: ShareRow
  deviceId: string
  onPaid: (next: CircleView) => void
  /** The server says this share is already settled; the screen should show that state. */
  onSettledElsewhere: () => void
}) {
  const { t, format } = useI18n()
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const round = circle.round
  const recipient = round?.recipient

  if (!round || !recipient) return null
  const code = circle.circle.code

  const done = (next: CircleView) => {
    onPaid(next)
    setPhase({ kind: 'idle' })
    onClose()
  }

  async function pay() {
    setPhase({ kind: 'waiting' })
    const outcome = await payShare({
      code,
      shareId: share.id,
      recipient: recipient!.address,
      payerAddress: share.payer?.address ?? '',
      nim: share.amountNim,
      roundNumber: round!.number,
      deviceId,
      // Found in the walkthrough: after approving, recording can take seconds while the
      // server checks the chain, and "Waiting for your wallet" was no longer true.
      onRecording: () => setPhase({ kind: 'recording' }),
    })

    if (outcome.ok) return done(outcome.circle)
    if (outcome.failure.kind === 'rejected') {
      setPhase({ kind: 'idle' })
      return onSettledElsewhere()
    }
    setPhase({ kind: 'failed', failure: outcome.failure })
  }

  /**
   * Money already moved; only Tanda's record is missing. Retrying re-sends the
   * hash we stashed. It must never go back through the wallet — that would open
   * a second send dialog for a share that is already paid.
   */
  async function recordAgain(txHash: string) {
    setPhase({ kind: 'recording' })
    try {
      const next = await api.recordSent(code, share.id, txHash, deviceId)
      clearUnreported(share.id)
      done(next)
    } catch (error) {
      if (isRefusal(error)) {
        clearUnreported(share.id)
        setPhase({ kind: 'idle' })
        return onSettledElsewhere()
      }
      setPhase({ kind: 'failed', failure: { kind: 'unreported', txHash } })
    }
  }

  const close = () => {
    setPhase({ kind: 'idle' })
    onClose()
  }

  return (
    <Sheet open={open} onClose={close} title={t.pay.title}>
      <div className="px-4 pt-2 pb-4">
        <p className="label">{t.roundOf(round.number, round.totalRounds)}</p>
        <h2 className="text-title tracking-title mt-1">{t.pay.title}</h2>

        <div className="mt-4 rounded-[var(--radius-card)] bg-raised divide-y divide-hairline">
          <Line k={t.pay.to}>
            <span className="text-cream">{recipient.displayName}</span>
          </Line>
          <Line k={t.pay.address}>
            <span className="num text-body text-muted break-all text-right">{recipient.address}</span>
          </Line>
          <Line k={t.pay.amount}>
            <span className="num text-pot tracking-pot text-cream">
              {format.plain(share.amountNim)}
              <span className="label ml-1.5">{circle.circle.currency}</span>
            </span>
          </Line>
        </div>

        {phase.kind === 'failed' ? (
          <div className="mt-4">
            <Failure failure={phase.failure} onRetry={pay} onRecord={recordAgain} />
          </div>
        ) : (
          <Button full className="mt-4" onClick={pay} disabled={phase.kind !== 'idle'}>
            {phase.kind === 'waiting'
              ? t.pay.working
              : phase.kind === 'recording'
                ? t.pay.recording
                : t.pay.action}
          </Button>
        )}

        <p className="text-muted text-body mt-3">{t.pay.explain(recipient.displayName)}</p>
      </div>
    </Sheet>
  )
}

/** Every failure is one of §11's named states, and each carries its own action. */
function Failure({
  failure,
  onRetry,
  onRecord,
}: {
  failure: PayFailure
  onRetry: () => void
  onRecord: (txHash: string) => void
}) {
  const { t } = useI18n()
  switch (failure.kind) {
    case 'cancelled':
      return <PaymentCancelled onRetry={onRetry} />
    case 'insufficient':
      return <InsufficientBalance shortfallNim={failure.shortfallNim} onRetry={onRetry} />
    case 'unreported':
      return (
        <CouldNotReach
          context="payment"
          layout="inline"
          recordedHash={failure.txHash}
          onRetry={() => onRecord(failure.txHash)}
        />
      )
    case 'wallet':
      return (
        <EmptyState
          layout="inline"
          title={t.pay.walletTitle}
          line={t.pay.walletFailed}
          action={{ label: t.states.cancelled.action, onClick: onRetry }}
        />
      )
    case 'rejected':
      return null
  }
}

function Line({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 min-h-[52px]">
      <span className="label shrink-0">{k}</span>
      <span className="text-card text-right">{children}</span>
    </div>
  )
}
