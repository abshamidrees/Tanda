/**
 * §8.8 Closing summary. When the last round settles: the full ring in mint,
 * the member's figures, "Everyone is square.", and a way to go again with the
 * same group.
 *
 * The figures are told the way the wallet saw them. "You sent" matches the
 * wallet's outgoing payments; the member's own share never left it, because it
 * settled against their own pot, so it is named rather than folded in. In a
 * product whose claim is an accurate record, no number here may disagree with
 * the wallet.
 *
 * Not optional: completeness is scored, and a product that cannot end reads as
 * a prototype.
 */
import { useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../components/Button'
import { Ring } from '../components/Ring'
import { Sheet } from '../components/Sheet'
import { CouldNotReach } from './states'
import { InviteShare } from './InviteShare'
import { api, type CircleView } from '../lib/api'
import { useI18n } from '../lib/i18n'

export function ClosingSummary({ view, deviceId }: { view: CircleView; deviceId: string }) {
  const { t, format } = useI18n()
  const [restarting, setRestarting] = useState(false)
  const { circle, you } = view
  const nim = (value: number) => `${format.plain(value)} ${circle.currency}`

  return (
    <>
      <div className="flex justify-center my-6">
        <Ring
          total={circle.memberCount}
          current={null}
          you={you?.position ?? null}
          pot={format.plain(circle.potNim)}
          currency={circle.currency}
        />
      </div>

      {you && (
        <div className="rounded-[var(--radius-card)] bg-surface divide-y divide-hairline overflow-hidden">
          <Figure label={t.closing.youSent} value={nim(you.totals.sentNim)} />
          <Figure
            label={t.closing.ownShare}
            note={t.closing.ownShareNote}
            value={nim(you.totals.ownShareNim)}
          />
          <Figure label={t.closing.youContributed} value={nim(you.totals.contributedNim)} />
          <Figure label={t.closing.youReceived} value={nim(you.totals.receivedNim)} />
        </div>
      )}

      <p className="text-title tracking-title text-mint text-center mt-6">{t.closing.square}</p>

      {you && (
        <>
          <Button full className="mt-6" onClick={() => setRestarting(true)}>
            {t.closing.startAnother}
          </Button>
          {restarting && (
            <RestartSheet view={view} deviceId={deviceId} onClose={() => setRestarting(false)} />
          )}
        </>
      )}
    </>
  )
}

/** One §5 row: label on the left, the amount right-aligned in mono. */
function Figure({ label, note, value }: { label: string; note?: ReactNode; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 min-h-[var(--row-pitch)]">
      <div className="min-w-0">
        <p className="text-body text-cream">{label}</p>
        {note && <p className="text-body text-muted">{note}</p>}
      </div>
      <span className="num text-body text-cream shrink-0">{value}</span>
    </div>
  )
}

type Phase = { kind: 'review' } | { kind: 'creating' } | { kind: 'failed' } | { kind: 'created'; code: string }

/**
 * "Pre-fills a new circle from this one" (§8.8). The terms carry over and are
 * shown the way §8.3 shows them before anyone commits; creating it hands back a
 * code for the same group. Nobody is added on their behalf — joining still
 * reads each member's own wallet.
 */
function RestartSheet({
  view,
  deviceId,
  onClose,
}: {
  view: CircleView
  deviceId: string
  onClose: () => void
}) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [phase, setPhase] = useState<Phase>({ kind: 'review' })
  const { circle, you } = view
  if (!you) return null

  async function create() {
    setPhase({ kind: 'creating' })
    try {
      const next = await api.createCircle(
        {
          name: circle.name,
          shareNim: circle.shareNim,
          frequency: circle.frequency,
          memberCount: circle.memberCount,
          displayName: you!.displayName,
          address: you!.address,
        },
        deviceId,
      )
      void qc.invalidateQueries({ queryKey: ['circles'] })
      setPhase({ kind: 'created', code: next.circle.code })
    } catch {
      setPhase({ kind: 'failed' })
    }
  }

  return (
    <Sheet open onClose={onClose} title={t.closing.sheetTitle}>
      <div className="px-4 pt-2 pb-4">
        <h2 className="text-title tracking-title mb-4">{t.closing.sheetTitle}</h2>

        {phase.kind === 'created' ? (
          <InviteShare name={circle.name} code={phase.code} />
        ) : (
          <>
            <p className="text-body text-muted">
              {t.closing.terms(circle.name, circle.memberCount, t.word[circle.frequency])}
            </p>
            <div className="mt-4 rounded-[var(--radius-card)] bg-raised px-4 py-3 text-body">
              <p className="text-cream text-balance">
                {t.closing.eachPays(circle.shareNim, circle.totalRounds, circle.potNim)}
              </p>
              <p className="text-cream mt-1">{t.closing.eachReceives(circle.potNim)}</p>
              <p className="text-mint mt-1">{t.closing.endsSquare}</p>
            </div>

            {phase.kind === 'failed' ? (
              <div className="mt-4">
                <CouldNotReach context="general" layout="inline" onRetry={create} />
              </div>
            ) : (
              <Button full className="mt-5" onClick={create} disabled={phase.kind === 'creating'}>
                {phase.kind === 'creating' ? t.closing.creating : t.closing.create}
              </Button>
            )}
          </>
        )}
      </div>
    </Sheet>
  )
}
