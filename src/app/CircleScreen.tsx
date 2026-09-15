/**
 * §8.5 Circle. Top to bottom, in the order the brief gives:
 * title, stat strip, ring at 200px, this-round panel, members, history, footer.
 * Once the last round settles, §8.8's closing summary takes the ring's place.
 */
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '../components/Button'
import { MemberRow } from '../components/MemberRow'
import { Ring } from '../components/Ring'
import { StatStrip } from '../components/StatStrip'
import { Back } from './Back'
import { ClosingSummary } from './ClosingSummary'
import { ConfirmReceived } from './ConfirmReceived'
import { InviteShare } from './InviteShare'
import { PaySheet } from './PaySheet'
import { AlreadyPaid, CodeNotFound, CouldNotReach } from './states'
import { ApiError, api, flushUnreported, unreportedFor, type CircleView } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { link } from '../lib/identity'

const DAY_MS = 86_400_000
/** A mistyped code and an unknown one are the same state to the user (§11). */
const CODE_ERRORS = new Set(['CODE_NOT_FOUND', 'CODE_MALFORMED'])

export function CircleScreen({ code, deviceId }: { code: string; deviceId: string }) {
  const qc = useQueryClient()
  const { t, format } = useI18n()
  const key = ['circle', code, deviceId]

  const { data, error, isPending, refetch } = useQuery({
    queryKey: key,
    queryFn: () => api.readCircle(code, deviceId),
    retry: (count, err) => !(err instanceof ApiError && CODE_ERRORS.has(err.code)) && count < 1,
    // Other members move this screen: someone takes the last seat, pays, confirms.
    // Found in the walkthrough: a member waiting on a forming circle saw nothing
    // change until they left and came back. Poll while it is open and on screen;
    // a closed circle never changes, and a hidden tab does not poll.
    refetchInterval: (query) => (query.state.data && query.state.data.circle.status !== 'closed' ? 8_000 : false),
  })

  const [paying, setPaying] = useState(false)
  // Whole days to a due date don't need a live clock; read it once, not per render.
  const [now] = useState(() => Date.now())
  const put = (next: CircleView) => {
    qc.setQueryData(key, next)
    void qc.invalidateQueries({ queryKey: ['circles'] })
  }

  // Replay any payment the wallet completed but the server never heard about.
  const replay = useMutation({
    mutationFn: () => flushUnreported(code, deviceId),
    onSuccess: (n) => n > 0 && refetch(),
  })
  useEffect(() => {
    if (data && unreportedFor(code).length > 0 && replay.isIdle) replay.mutate()
  }, [data, code, replay])

  // §7: loading is a muted mono word, never a spinner or a shimmer.
  if (isPending) {
    return (
      <Shell>
        <p className="label">{t.reading}</p>
      </Shell>
    )
  }

  if (error) {
    if (error instanceof ApiError && CODE_ERRORS.has(error.code)) {
      return <CodeNotFound backHref={link()} />
    }
    return <CouldNotReach context="general" onRetry={() => refetch()} />
  }

  const { circle, round, members, history, you } = data
  const closed = circle.status === 'closed'
  const mine = round?.shares.find((s) => s.isMine) ?? null
  const owes = mine?.state === 'outstanding' && !round?.youAreUp
  const days = round ? Math.ceil((new Date(round.dueAt).getTime() - now) / DAY_MS) : null
  const overdue = round ? now > new Date(round.dueAt).getTime() : false

  return (
    <Shell>
      <header>
        <Back />
        <h1 className="text-title tracking-title">{circle.name}</h1>
      </header>

      {closed ? (
        <ClosingSummary view={data} deviceId={deviceId} />
      ) : (
        <>
          <div className="mt-3">
            <StatStrip
              stats={[
                {
                  label: t.word.round,
                  value: round ? `${round.number} / ${round.totalRounds}` : t.word.forming,
                },
                { label: t.word.pot, value: `${format.plain(circle.potNim)} ${circle.currency}` },
                { label: t.word.due, value: days === null ? t.dueWhenFull : t.dueShort(days) },
              ]}
            />
          </div>

          <div className="flex justify-center my-6">
            <Ring
              total={circle.memberCount}
              current={round?.recipient?.position ?? 0}
              you={you?.position ?? null}
              pot={format.plain(circle.potNim)}
              currency={circle.currency}
            />
          </div>

          {!round && circle.status === 'forming' && (
            // Until the last seat fills there is no round, only an invite to pass on.
            <section className="rounded-[var(--radius-card)] bg-raised p-4">
              <p className="label">{t.word.forming}</p>
              <p className="text-card text-cream mt-1 mb-4">{t.home.waiting(circle.seatsRemaining)}</p>
              <InviteShare name={circle.name} code={circle.code} showOpen={false} />
            </section>
          )}

          {round && (
            <section className="rounded-[var(--radius-card)] bg-raised p-4">
              <p className="label">{t.word.thisRound}</p>
              {round.youAreUp ? (
                <>
                  <p className="text-title tracking-title text-gold mt-1">{t.circle.youAreUp}</p>
                  <p className="text-muted text-body mt-1">{t.circle.youReceive(round.potNim)}</p>
                </>
              ) : (
                <>
                  <p className="text-card text-cream mt-1">
                    {t.circle.isUp(round.recipient?.displayName ?? '', round.recipient?.position ?? 0)}
                  </p>
                  {mine?.state === 'paid' || mine?.state === 'sent' ? (
                    // §11: the pay button is replaced outright, never left disabled and silent.
                    <div className="mt-3">
                      <AlreadyPaid
                        confirmed={mine.state === 'paid'}
                        recipientName={round.recipient?.displayName ?? ''}
                        txHash={mine.txHash}
                        verified={mine.verifiedAt !== null}
                      />
                    </div>
                  ) : owes ? (
                    <Button full className="mt-3" onClick={() => setPaying(true)}>
                      {t.circle.payYourShare(circle.shareNim)}
                    </Button>
                  ) : (
                    <p className="text-muted text-body mt-2">{t.circle.notAMember}</p>
                  )}
                </>
              )}
            </section>
          )}

          <ConfirmReceived circle={data} deviceId={deviceId} onChange={put} overdue={overdue} />

          <section className="mt-5">
            <p className="label mb-2">{t.word.members}</p>
            <div className="rounded-[var(--radius-card)] bg-surface divide-y divide-hairline overflow-hidden">
              {members.map((member) => (
                <MemberRow key={member.id} member={member} overdue={overdue} />
              ))}
            </div>
          </section>
        </>
      )}

      {history.length > 0 && (
        <details className="group mt-5">
          {/* The chevron flips without a transition: rotation is not in §7's budget. */}
          <summary className="label cursor-pointer list-none py-2 flex items-center gap-2 min-h-[44px]">
            <span aria-hidden="true" className="inline-block group-open:rotate-90">
              &rsaquo;
            </span>
            {t.circle.history(history.length)}
          </summary>
          <div className="mt-1 rounded-[var(--radius-card)] bg-surface divide-y divide-hairline overflow-hidden">
            {history.map((entry) => (
              <div
                key={entry.number}
                className="flex items-center gap-3 px-4 min-h-[var(--row-pitch)]"
              >
                <span className="num text-body text-muted w-5 shrink-0">{entry.number}</span>
                <span className="text-card text-cream flex-1 truncate">
                  {entry.recipient?.displayName}
                </span>
                <span className="num text-body text-mint shrink-0">
                  {format.plain(entry.potNim)} {circle.currency}
                </span>
                <span className="num text-body text-muted shrink-0 w-14 text-right">
                  {entry.settledAt ? format.date(entry.settledAt) : ''}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      <p className="text-muted text-body mt-6">{t.footer}</p>

      {mine && round && !closed && (
        <PaySheet
          open={paying}
          onClose={() => setPaying(false)}
          circle={data}
          share={mine}
          deviceId={deviceId}
          onPaid={put}
          onSettledElsewhere={() => {
            setPaying(false)
            void refetch()
          }}
        />
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-ground text-cream font-ui px-4 py-6 max-w-[430px] mx-auto">
      {children}
    </main>
  )
}
