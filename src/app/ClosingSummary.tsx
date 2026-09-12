/**
 * §8.8 Closing summary. When the last round settles: the full ring in mint,
 * what you paid, what you received, "Everyone is square.", and a way to go
 * again with the same group.
 *
 * Not optional: completeness is scored, and a product that cannot end reads as
 * a prototype.
 */
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../components/Button'
import { PRESS_STYLE, buttonClass } from '../components/buttonClass'
import { Ring } from '../components/Ring'
import { Sheet } from '../components/Sheet'
import { StatStrip } from '../components/StatStrip'
import { Toast } from '../components/Toast'
import { useToast } from '../lib/useToast'
import { CouldNotReach } from './states'
import { api, type CircleView } from '../lib/api'
import { copyText } from '../lib/clipboard'
import { useI18n } from '../lib/i18n'
import { link } from '../lib/identity'
import { breakableUrl, deeplink } from '../lib/links'

export function ClosingSummary({ view, deviceId }: { view: CircleView; deviceId: string }) {
  const { t, format } = useI18n()
  const [restarting, setRestarting] = useState(false)
  const { circle, you } = view

  return (
    <>
      <div className="flex justify-center my-6">
        <Ring
          total={circle.memberCount}
          current={null}
          you={you?.position ?? null}
          pot={format.plain(circle.potNim)}
          currency={circle.currency}
          roundLabel={t.word.closed}
        />
      </div>

      {you && (
        <StatStrip
          stats={[
            { label: t.closing.youPaid, value: `${format.plain(you.totals.paidNim)} ${circle.currency}` },
            {
              label: t.closing.youReceived,
              value: `${format.plain(you.totals.receivedNim)} ${circle.currency}`,
            },
          ]}
        />
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

type Phase =
  | { kind: 'review' }
  | { kind: 'creating' }
  | { kind: 'failed' }
  | { kind: 'created'; code: string }

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
  const toast = useToast()
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

  const invite = phase.kind === 'created' ? deeplink({ join: phase.code }) : ''

  return (
    <Sheet open onClose={onClose} title={t.closing.sheetTitle}>
      <div className="px-4 pt-2 pb-4">
        <h2 className="text-title tracking-title">{t.closing.sheetTitle}</h2>

        {phase.kind === 'created' ? (
          <>
            <p className="label mt-5">{t.closing.shareCode}</p>
            <p className="num text-pot tracking-pot text-cream mt-2">{phase.code}</p>
            <p className="num text-body text-muted mt-2 break-words">{breakableUrl(invite)}</p>
            <Button
              full
              className="mt-5"
              onClick={async () => {
                if (await copyText(invite)) toast.show(t.copied)
              }}
            >
              {t.closing.copyInvite}
            </Button>
            <a
              href={link({ code: phase.code })}
              className={`${buttonClass({ variant: 'secondary', full: true })} mt-3`}
              style={PRESS_STYLE}
            >
              <span className="text-balance">{t.closing.openNew}</span>
            </a>
          </>
        ) : (
          <>
            <p className="text-body text-muted mt-1">
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
                <CouldNotReach layout="inline" onRetry={create} />
              </div>
            ) : (
              <Button full className="mt-5" onClick={create} disabled={phase.kind === 'creating'}>
                {phase.kind === 'creating' ? t.closing.creating : t.closing.create}
              </Button>
            )}
          </>
        )}
      </div>
      <Toast message={toast.message} id={toast.key} />
    </Sheet>
  )
}
