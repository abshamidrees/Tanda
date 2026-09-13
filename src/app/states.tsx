/**
 * §11, all nine. Each is a title, one line of explanation and an action, in the
 * user's language. Screens render these rather than writing their own, which is
 * what lets states.test.tsx prove that every one of them exists and says the
 * right thing.
 *
 *   1 OutsideNimiqPay        5 InsufficientBalance    9 AlreadyPaid
 *   2 ConnectingToWallet     6 CodeNotFound
 *   3 WaitingForNetwork      7 CircleFull
 *   4 PaymentCancelled       8 CouldNotReach
 */
import { useMemo } from 'react'
import { encode } from 'uqr'
import { EmptyState } from '../components/EmptyState'
import { Ring } from '../components/Ring'
import { Toast } from '../components/Toast'
import { useToast } from '../lib/useToast'
import { copyText } from '../lib/clipboard'
import { useI18n } from '../lib/i18n'
import { breakableUrl } from '../lib/links'

/** A ring with every segment ahead of it: the shape of "not started yet". */
const Waiting = () => <Ring total={6} current={0} size={120} />

/** 1. Opened outside Nimiq Pay: §1's desktop card, with the deeplink and a QR code. */
export function OutsideNimiqPay({ link }: { link: string }) {
  const { t } = useI18n()
  const toast = useToast()
  return (
    <>
      <EmptyState
        layout="card"
        visual={<QrCode value={link} />}
        title={t.states.outside.title}
        line={t.states.outside.line}
        action={{
          label: t.states.outside.action,
          onClick: async () => {
            if (await copyText(link)) toast.show(t.copied)
          },
        }}
      >
        <p className="num text-body text-muted mt-3 break-words">{breakableUrl(link)}</p>
      </EmptyState>
      <Toast message={toast.message} id={toast.key} />
    </>
  )
}

/** 2. Provider not ready. The retry is withheld for the first 8 seconds (§11). */
export function ConnectingToWallet({ canRetry, onRetry }: { canRetry: boolean; onRetry: () => void }) {
  const { t } = useI18n()
  return (
    <EmptyState
      visual={<Waiting />}
      title={t.states.connecting.title}
      line={t.states.connecting.line}
      action={canRetry ? { label: t.states.connecting.action, onClick: onRetry } : undefined}
    />
  )
}

/** 3. Consensus not established. */
export function WaitingForNetwork({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n()
  return (
    <EmptyState
      visual={<Waiting />}
      title={t.states.network.title}
      line={t.states.network.line}
      action={{ label: t.states.network.action, onClick: onRetry, variant: 'secondary' }}
    />
  )
}

/** 4. The user backed out of the send dialog. The row stays outstanding. */
export function PaymentCancelled({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n()
  return (
    <EmptyState
      layout="inline"
      title={t.states.cancelled.title}
      line={t.states.cancelled.line}
      action={{ label: t.states.cancelled.action, onClick: onRetry }}
    />
  )
}

/** 5. Insufficient balance, with the exact shortfall when it can be known. */
export function InsufficientBalance({
  shortfallNim,
  onRetry,
}: {
  shortfallNim: number | null
  onRetry: () => void
}) {
  const { t } = useI18n()
  return (
    <EmptyState
      layout="inline"
      title={t.states.insufficient.title}
      line={
        shortfallNim === null
          ? t.states.insufficient.lineUnknown
          : t.states.insufficient.line(shortfallNim)
      }
      action={{ label: t.states.insufficient.action, onClick: onRetry }}
    />
  )
}

/** 6. Invalid or expired code. */
export function CodeNotFound({ backHref }: { backHref: string }) {
  const { t } = useI18n()
  return (
    <EmptyState
      title={t.states.codeNotFound.title}
      line={t.states.codeNotFound.line}
      action={{ label: t.states.codeNotFound.action, href: backHref, variant: 'secondary' }}
    />
  )
}

/** 7. Circle already full. */
export function CircleFull({ memberCount, backHref }: { memberCount: number; backHref: string }) {
  const { t } = useI18n()
  return (
    <EmptyState
      visual={<Ring total={memberCount} current={0} size={120} />}
      title={t.states.circleFull.title}
      line={t.states.circleFull.line(memberCount)}
      action={{ label: t.states.circleFull.action, href: backHref, variant: 'secondary' }}
    />
  )
}

/**
 * 8. A network request failed.
 *
 * §11 gives this state one string, "Your payment is unaffected", but it only
 * makes sense where a payment is in flight. So context is required, and every
 * call site has to say which it is:
 *
 *   general  anywhere else — home, a circle, creating a circle. A neutral line.
 *   payment  inside the pay sheet only, where §11's line is true and relevant.
 *
 * With `recordedHash`, money already moved and only Tanda's record is missing:
 * the retry re-sends that hash and must never reopen the wallet, or the member
 * pays twice.
 */
export function CouldNotReach(
  props: { onRetry: () => void; layout?: 'page' | 'inline' } & (
    | { context: 'general' }
    | { context: 'payment'; recordedHash?: string }
  ),
) {
  const { t } = useI18n()
  const { onRetry, layout = 'page' } = props
  const copy = t.states.unreachable
  const recordedHash = props.context === 'payment' ? props.recordedHash : undefined
  const line =
    props.context === 'general' ? copy.line : recordedHash ? copy.lineRecorded : copy.linePayment

  return (
    <EmptyState
      layout={layout}
      tone={recordedHash ? 'mint' : 'coral'}
      title={copy.title}
      line={line}
      action={{ label: copy.action, onClick: onRetry, variant: layout === 'page' ? 'secondary' : 'primary' }}
    >
      {recordedHash && (
        <p className="num text-body text-muted mt-1 break-all">{t.pay.savedOnDevice(recordedHash)}</p>
      )}
    </EmptyState>
  )
}

/**
 * 9. Already paid this round. This replaces the pay button outright — never a
 * disabled button left sitting there saying nothing (§11).
 */
export function AlreadyPaid({
  confirmed,
  recipientName,
  txHash,
  verified,
}: {
  confirmed: boolean
  recipientName: string
  txHash: string | null
  verified: boolean
}) {
  const { t } = useI18n()
  const toast = useToast()
  const copy = t.states.alreadyPaid
  return (
    <>
      <EmptyState
        layout="inline"
        tone="mint"
        title={confirmed ? copy.titlePaid : copy.titleSent}
        line={confirmed ? copy.linePaid(recipientName) : copy.lineSent(recipientName)}
        action={
          txHash
            ? {
                label: copy.action,
                variant: 'secondary',
                onClick: async () => {
                  if (await copyText(txHash)) toast.show(t.copied)
                },
              }
            : undefined
        }
      >
        {txHash && (
          <p className="num text-body text-muted mt-1">
            {txHash.slice(0, 6)}…{txHash.slice(-6)}
            {verified && <span className="text-mint whitespace-nowrap"> · {t.verifiedOnChain}</span>}
          </p>
        )}
      </EmptyState>
      <Toast message={toast.message} id={toast.key} />
    </>
  )
}

/**
 * The deeplink as a scannable code, drawn from the raw module grid in the
 * palette. Hidden from assistive tech: the same link is printed beside it.
 */
function QrCode({ value }: { value: string }) {
  const { size, data } = useMemo(() => encode(value, { border: 2 }), [value])
  const modules = useMemo(
    () =>
      data
        .flatMap((row, y) => row.map((dark, x) => (dark ? `M${x} ${y}h1v1h-1z` : '')))
        .join(''),
    [data],
  )
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${size} ${size}`}
      width={176}
      height={176}
      shapeRendering="crispEdges"
      className="rounded-[var(--radius-field)]"
    >
      <rect width={size} height={size} fill="var(--color-cream)" />
      <path d={modules} fill="var(--color-ground)" />
    </svg>
  )
}
