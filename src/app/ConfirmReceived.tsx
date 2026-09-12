/**
 * §8.7 Confirm received. Only the member who is up sees this.
 *
 * Chain reads turned out to be possible (docs/DAY-ONE.md), so a share Tanda
 * could check itself carries `verified on chain`.
 *
 * This departs from §8.7 on purpose, which reserves the manual button for
 * unverified shares: here every sent share still needs the receiver's tap.
 * Verification never confirms on the receiver's behalf — the chain proves a
 * transfer happened, only the receiver can say it counted. That two-sided
 * sign-off is §9's mechanism and the product's actual claim.
 */
import { useState } from 'react'
import { Button } from '../components/Button'
import { api, ApiError, type CircleView, type ShareRow } from '../lib/api'
import { useI18n } from '../lib/i18n'

/** Head and tail, the way a hash is actually recognised. */
function shortHash(hash: string) {
  return `${hash.slice(0, 4)}…${hash.slice(-4)}`
}

export function ConfirmReceived({
  circle,
  deviceId,
  onChange,
}: {
  circle: CircleView
  deviceId: string
  onChange: (next: CircleView) => void
}) {
  const { t } = useI18n()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const round = circle.round

  if (!round || !round.youAreUp) return null

  const incoming = round.shares.filter((s) => s.payer?.id !== round.recipient?.id)
  const awaiting = incoming.filter((s) => !s.confirmedAt)

  async function confirm(share: ShareRow) {
    setBusy(share.id)
    setError(null)
    try {
      onChange(await api.confirmReceived(circle.circle.code, share.id, deviceId))
    } catch (e) {
      // Server wording is English and not for users; say it in their language.
      setError(e instanceof ApiError && e.offline ? t.confirm.offline : t.somethingWrong)
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="mt-5">
      <div className="flex items-baseline justify-between">
        {/* The panel above already says "You are up" in gold; don't repeat it. */}
        <p className="label">{t.confirm.heading}</p>
        <span className="num text-body text-muted">
          {incoming.length - awaiting.length}/{incoming.length}
        </span>
      </div>

      <div className="mt-2 rounded-[var(--radius-card)] bg-surface divide-y divide-hairline overflow-hidden">
        {incoming.map((share) => (
          // §5 row: title, subtitle under it, state on the right — two lines, not three.
          <div key={share.id} className="flex items-center gap-3 px-4 py-3 min-h-[var(--row-pitch)]">
            <div className="min-w-0 flex-1">
              <p className="text-card text-cream truncate">{share.payer?.displayName}</p>
              {/* Never wraps: a long line gives up the hash tail, not the row pitch. */}
              <p className="num text-body text-muted truncate">
                {share.amountNim.toLocaleString()} {circle.circle.currency}
                {share.txHash && <> · {shortHash(share.txHash)}</>}
                {share.verifiedAt && <span className="text-mint"> · {t.verifiedOnChain}</span>}
              </p>
            </div>

            {share.confirmedAt ? (
              <span className="chip-paid label px-2 py-1 rounded-[var(--radius-chip)] shrink-0">
                {t.confirm.confirmed}
              </span>
            ) : share.sentAt ? (
              <Button
                size="compact"
                className="shrink-0"
                onClick={() => confirm(share)}
                disabled={busy === share.id}
              >
                {busy === share.id ? t.confirm.working : t.confirm.action}
              </Button>
            ) : (
              <span className="chip-outstanding label px-2 py-1 rounded-[var(--radius-chip)] shrink-0">
                {t.chip.outstanding}
              </span>
            )}
          </div>
        ))}
      </div>

      {error && <p className="text-coral text-body mt-2">{error}</p>}

      <p className="text-muted text-body mt-2 leading-relaxed">
        {awaiting.length === 0 ? t.confirm.allIn : t.confirm.waiting(awaiting.length)}
      </p>
    </section>
  )
}
