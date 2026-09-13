/**
 * §6 The rotation ring. The signature element.
 *
 * Geometry is fixed: viewBox 0 0 200 200, outer radius 84, inner 54, one
 * segment per member, 6 degrees of gap, clockwise from 12 o'clock. Segment 1
 * is the member who is up in round 1, so the ring and the rotation order are
 * the same fact shown two ways.
 *
 * Decorative in the accessibility tree (§6). Every fact it shows is also text
 * in the stat strip and the member list.
 */

import type { CSSProperties } from 'react'
import { useI18n } from '../lib/i18n'

const CENTRE = 100
const R_OUTER = 84
const R_INNER = 54
/** The current turn sits proud: 6 units thicker on both radii. */
const PROUD = 6
const GAP_DEGREES = 6
const DOT_RADIUS = 5
const FUTURE_STROKE = 3
/** Never render a hairline thinner than 1px on screen (§4). */
const MIN_STROKE_PX = 1
/** Below this the viewer's dot reads as a rendering fleck, not a marker. */
const MIN_DOT_RADIUS_PX = 1.75

type SegmentState = 'settled' | 'current' | 'future'

function polar(angleDegrees: number, radius: number) {
  // -90 puts 0 at 12 o'clock; positive angles run clockwise.
  const radians = ((angleDegrees - 90) * Math.PI) / 180
  return {
    x: CENTRE + radius * Math.cos(radians),
    y: CENTRE + radius * Math.sin(radians),
  }
}

/** An annulus sector: out along the outer arc, back along the inner one. */
function sectorPath(from: number, to: number, rInner: number, rOuter: number) {
  const outerStart = polar(from, rOuter)
  const outerEnd = polar(to, rOuter)
  const innerEnd = polar(to, rInner)
  const innerStart = polar(from, rInner)
  const largeArc = to - from > 180 ? 1 : 0

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ')
}

/**
 * Centre content has to fit a 108px hole, and §4 and §6 cannot both hold in it:
 * §4 sets the pot at 2.5rem with a currency on every amount, but "3,000" alone
 * measures 114px at that size. The binding constraint is each text box's
 * corners staying inside the inner circle — "ROUND 3 OF 6" is 95px wide, so it
 * only clears a 54px radius within ~25px of centre, which caps the amount above
 * it near 24px. So 2.5rem is the cap, not the constant: a short pot gets the
 * full size, a longer one shrinks rather than colliding with its own ring.
 *
 * DM Mono is monospaced, so width is exact: 0.57em advance at -0.03em tracking,
 * measured in the browser rather than assumed.
 */
const INNER_WIDTH_PX = 97
const MONO_ADVANCE = 0.57
const POT_MAX_PX = 40
/** "NIM" at label size, plus the gap before it. */
const CURRENCY_ALLOWANCE_PX = 29

function fitPotSize(text: string) {
  const available = INNER_WIDTH_PX - CURRENCY_ALLOWANCE_PX
  return Math.min(POT_MAX_PX, Math.floor(available / (text.length * MONO_ADVANCE)))
}

/**
 * Every property that changes on settle must be interpolable, or it snaps.
 * `fill: none` cannot fade into gold — measured: the incoming segment went gold
 * at 0ms, ignoring both the 400ms and the 120ms delay, so for a moment two
 * segments were gold at once. So nothing here is ever `none`: a future segment
 * holds its gold at zero opacity and fades it in, and its hairline fades out.
 */
const PAINT: Record<
  SegmentState,
  { fill: string; fillOpacity: number; strokeOpacity: number; stroked: boolean }
> = {
  settled: { fill: 'var(--color-mint)', fillOpacity: 1, strokeOpacity: 0, stroked: false },
  current: { fill: 'var(--color-gold)', fillOpacity: 1, strokeOpacity: 0, stroked: false },
  future: { fill: 'var(--color-gold)', fillOpacity: 0, strokeOpacity: 1, stroked: true },
}

export function Ring({
  total,
  current,
  you = null,
  size = 200,
  pot,
  currency,
  roundLabel,
}: {
  /** Members in the circle. One segment each. */
  total: number
  /**
   * Position that is up now, 1-based. 0 before round 1 opens (every segment is
   * a future turn); null once the circle has closed (every segment settled).
   */
  current: number | null
  /** The viewer's position, marked with a cream dot. */
  you?: number | null
  size?: number
  /** Centre content. Dropped entirely below 200px (§6). */
  pot?: string
  currency?: string
  roundLabel?: string
}) {
  const { t } = useI18n()
  const slice = 360 / total
  const span = slice - GAP_DEGREES
  const showCentre = size >= 200 && pot !== undefined
  const unitsPerPx = 200 / size
  const futureStroke = Math.max(FUTURE_STROKE, MIN_STROKE_PX * unitsPerPx)
  const dotRadius = Math.max(DOT_RADIUS, MIN_DOT_RADIUS_PX * unitsPerPx)

  const segments = Array.from({ length: total }, (_, index) => {
    const position = index + 1
    const state: SegmentState =
      current === null || position < current
        ? 'settled'
        : position === current
          ? 'current'
          : 'future'

    // Half a gap either side keeps the gaps centred between segments.
    const from = index * slice + GAP_DEGREES / 2
    const to = from + span
    const proud = state === 'current' ? PROUD : 0

    return {
      position,
      state,
      d: sectorPath(from, to, R_INNER - proud, R_OUTER + proud),
      midpoint: polar(from + span / 2, (R_INNER + R_OUTER) / 2),
    }
  })

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 200 200" width={size} height={size} role="presentation">
        {segments.map((segment) => (
          <path
            key={segment.position}
            d={segment.d}
            fill={PAINT[segment.state].fill}
            fillOpacity={PAINT[segment.state].fillOpacity}
            stroke="var(--color-hairline)"
            strokeOpacity={PAINT[segment.state].strokeOpacity}
            strokeWidth={PAINT[segment.state].stroked ? futureStroke : 0}
            style={
              {
                // The proud radii live in the geometry. Chromium can transition
                // `d` as a CSS property, so on Android the turn grows into place;
                // WebKit ignores it and uses the attribute, which simply snaps.
                d: `path("${segment.d}")`,
                transitionProperty: 'fill, fill-opacity, stroke-opacity, stroke-width, d',
                transitionDuration: 'var(--dur-settle)',
                transitionTimingFunction: 'var(--ease)',
                // The turn that just ended recolours immediately; the one taking
                // over follows 120ms behind, so the handover reads as a handover.
                transitionDelay: segment.state === 'current' ? '120ms' : '0ms',
              } as CSSProperties
            }
          />
        ))}

        {/* How a member finds themselves without reading a name (§6). */}
        {you !== null && you >= 1 && you <= total && (
          <circle
            cx={segments[you - 1].midpoint.x}
            cy={segments[you - 1].midpoint.y}
            r={dotRadius}
            fill="var(--color-cream)"
          />
        )}
      </svg>

      {showCentre && (
        <div
          className="absolute left-1/2 top-1/2 flex flex-col items-center justify-center gap-0.5"
          style={{
            width: INNER_WIDTH_PX,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <span className="label leading-none">{t.word.pot}</span>
          <span className="flex items-baseline gap-1.5 leading-none">
            <span
              className="num tracking-pot text-cream leading-none"
              style={{ fontSize: fitPotSize(pot!) }}
            >
              {pot}
            </span>
            {currency && <span className="label leading-none">{currency}</span>}
          </span>
          {roundLabel && <span className="label leading-none">{roundLabel}</span>}
        </div>
      )}
    </div>
  )
}
