/**
 * §8.2 the home card. One per circle: a 40px ring on the left, then the circle
 * name, the round, the pot, and one state line. Tapping it opens the circle.
 *
 * At 40px the ring drops its centre content (§6). Only the arcs read, and
 * that is enough to see whose turn it is without opening anything.
 */
import type { ReactNode } from 'react'
import { Ring } from './Ring'
import { useI18n, type Messages } from '../lib/i18n'

export type CircleState =
  | { kind: 'up' }
  /** Whole days until the share is due; negative once it is overdue. */
  | { kind: 'due'; days: number }
  | { kind: 'waiting'; members: number }
  | { kind: 'closed' }

/**
 * Colour still means position in the cycle (§4), so the state line obeys it.
 * Every count or day in it is mono (§4), which the catalog handles.
 */
function stateLine(state: CircleState, t: Messages): { text: ReactNode; tone: string } {
  switch (state.kind) {
    case 'up':
      return { text: t.home.up, tone: 'text-gold' }
    case 'due':
      if (state.days < 0) return { text: t.home.overdue(Math.abs(state.days)), tone: 'text-coral' }
      return {
        text:
          state.days === 0
            ? t.home.dueToday
            : state.days === 1
              ? t.home.dueTomorrow
              : t.home.dueIn(state.days),
        tone: 'text-muted',
      }
    case 'waiting':
      return { text: t.home.waiting(state.members), tone: 'text-muted' }
    case 'closed':
      return { text: t.word.closed, tone: 'text-mint' }
  }
}

export function RoundCard({
  href,
  name,
  total,
  current,
  you,
  roundLabel,
  pot,
  currency,
  state,
}: {
  href: string
  name: string
  total: number
  current: number | null
  you: number | null
  /** "Round 3 of 6", or "Forming" before round 1 opens. The caller knows which. */
  roundLabel: string
  pot: string
  currency: string
  state: CircleState
}) {
  const { t } = useI18n()
  const line = stateLine(state, t)

  return (
    <a
      href={href}
      className="flex items-center gap-4 px-4 py-4 min-h-[var(--row-pitch)] active:bg-raised"
      style={{
        transitionProperty: 'background-color',
        transitionDuration: 'var(--dur-row)',
        transitionTimingFunction: 'var(--ease)',
      }}
    >
      <Ring total={total} current={current} you={you} size={40} />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-card text-cream truncate">{name}</span>
          <span className="num text-body text-cream shrink-0">
            {pot} {currency}
          </span>
        </div>
        <p className="label mt-1">{roundLabel}</p>
        <p className={`text-body mt-1 ${line.tone}`}>{line.text}</p>
      </div>
    </a>
  )
}
