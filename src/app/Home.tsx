/**
 * §8.2 Home. One card per circle; with none, the empty state.
 */
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { EmptyState } from '../components/EmptyState'
import { Ring } from '../components/Ring'
import { RoundCard, type CircleState } from '../components/RoundCard'
import { CouldNotReach } from './states'
import { api, type CircleView } from '../lib/api'
import { useI18n, type Messages } from '../lib/i18n'
import { link } from '../lib/identity'

const DAY_MS = 86_400_000

/** What the card needs, derived from the same view the circle screen uses. */
function card(view: CircleView, t: Messages, now: number): {
  current: number | null
  roundLabel: string
  state: CircleState
} {
  const { circle, round } = view
  const total = circle.totalRounds

  if (circle.status === 'closed') {
    return { current: null, roundLabel: t.roundOf(total, total), state: { kind: 'closed' } }
  }

  if (!round) {
    return {
      current: 0,
      roundLabel: t.word.forming,
      state: { kind: 'waiting', members: circle.seatsRemaining },
    }
  }

  const base = {
    current: round.recipient?.position ?? 0,
    roundLabel: t.roundOf(round.number, total),
  }

  if (round.youAreUp) return { ...base, state: { kind: 'up' } }

  const mine = round.shares.find((share) => share.isMine)
  if (mine?.state === 'outstanding') {
    const days = Math.ceil((new Date(round.dueAt).getTime() - now) / DAY_MS)
    return { ...base, state: { kind: 'due', days } }
  }

  return { ...base, state: { kind: 'waiting', members: round.outstanding } }
}

export function Home({ deviceId }: { deviceId: string }) {
  const qc = useQueryClient()
  const { t, format } = useI18n()
  const [now] = useState(() => Date.now())

  const { data, error, isPending, refetch } = useQuery({
    queryKey: ['circles', deviceId],
    // One retry, not the default three with backoff: an outage should surface
    // in about a second, not after seven seconds of "reading".
    retry: 1,
    queryFn: async () => {
      const views = await api.listCircles(deviceId)
      // Opening a circle from here should not wait on a second request.
      for (const view of views) qc.setQueryData(['circle', view.circle.code, deviceId], view)
      return views
    },
  })

  if (isPending) {
    return (
      <Shell>
        <p className="label">{t.reading}</p>
      </Shell>
    )
  }

  if (error) return <CouldNotReach context="general" onRetry={() => refetch()} />

  if (data.length === 0) {
    return (
      <EmptyState
        visual={<Ring total={6} current={0} size={120} />}
        title={t.home.emptyTitle}
        line={t.home.emptyLine}
        action={{ label: t.home.start }}
        secondary={{ label: t.home.join }}
      />
    )
  }

  return (
    <Shell>
      <h1 className="text-title tracking-title">{t.word.circles}</h1>

      <div className="mt-5 flex flex-col gap-3">
        {data.map((view) => {
          const derived = card(view, t, now)
          return (
            <div
              key={view.circle.id}
              className="rounded-[var(--radius-card)] bg-surface overflow-hidden"
            >
              <RoundCard
                href={link({ code: view.circle.code })}
                name={view.circle.name}
                total={view.circle.memberCount}
                current={derived.current}
                you={view.you?.position ?? null}
                roundLabel={derived.roundLabel}
                pot={format.plain(view.circle.potNim)}
                currency={view.circle.currency}
                state={derived.state}
              />
            </div>
          )
        })}
      </div>
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
