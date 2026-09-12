/**
 * §8.5 members list. Position in mono, name, right-aligned state chip.
 * The member who is up gets a gold left border and nothing else.
 */
import type { MemberRow as Row } from '../lib/api'
import { useI18n } from '../lib/i18n'

const CHIP: Record<Row['state'], string> = {
  paid: 'chip-paid',
  sent: 'chip-paid',
  outstanding: 'chip-outstanding',
  'not due': 'chip-notdue',
}

export function MemberRow({ member }: { member: Row }) {
  const { t } = useI18n()
  return (
    <div
      className={`flex items-center gap-3 px-4 min-h-[var(--row-pitch)] ${member.isUp ? 'row-up' : ''}`}
    >
      <span className="num text-body text-muted w-5 shrink-0">{member.position}</span>

      <div className="min-w-0 flex-1">
        <p className="text-card text-cream truncate">
          {member.displayName}
          {member.isYou && <span className="text-muted"> · {t.word.you}</span>}
        </p>
        {member.state === 'sent' && (
          <p className="text-body text-muted">{t.sentWaiting}</p>
        )}
      </div>

      <span
        className={`${CHIP[member.state]} label px-2 py-1 rounded-[var(--radius-chip)] shrink-0`}
        style={{
          // §7: the only row animation, 160ms, on the one curve.
          transitionProperty: 'background-color, color',
          transitionDuration: 'var(--dur-row)',
          transitionTimingFunction: 'var(--ease)',
        }}
      >
        {t.chip[member.state]}
      </span>
    </div>
  )
}
