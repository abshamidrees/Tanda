/**
 * §5 stat strip. Two to four label-over-value pairs, mono, hairline dividers,
 * directly under the screen title. Once per screen.
 *
 * This is also where the ring's facts live as text (§6): the ring is
 * decorative, so round, pot and due date must be readable here.
 */

export interface Stat {
  label: string
  value: string
}

export function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <dl className="flex items-stretch border-y border-hairline">
      {stats.map((stat, index) => (
        <div
          key={stat.label}
          className={`flex-1 min-w-0 py-3 ${index > 0 ? 'border-l border-hairline pl-3' : ''} ${
            index < stats.length - 1 ? 'pr-3' : ''
          }`}
        >
          <dt className="label">{stat.label}</dt>
          <dd className="num text-body text-cream mt-1 truncate">{stat.value}</dd>
        </div>
      ))}
    </dl>
  )
}
