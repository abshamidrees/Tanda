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

import { useLayoutEffect, useRef, type CSSProperties } from 'react'
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
 * The centre has to clear the current turn, and the current turn sits proud:
 * its inner edge comes 48px in, wherever in the ring it is. §6 also asks for
 * "ROUND 3 OF 6" under the amount, but at label size that line is 95px wide,
 * and the hole is 96px across at the proud edge, so it cannot sit under
 * anything without touching the ring. On a real phone it did. The round is
 * the stat strip's first figure, directly above, so the centre keeps the pot
 * and puts its currency (§4) on the line beneath instead.
 *
 * 2.5rem is the cap, not the constant. A short pot gets the full size and a
 * longer one shrinks, to the text as rendered rather than to assumed metrics:
 * an earlier fit computed widths and forgot heights, and a one-digit pot grew
 * into the ring. Measuring also covers a missing web font and a host that
 * zooms text.
 */
const CLEAR_RADIUS = R_INNER - PROUD - 4
const POT_MAX_PX = 40
const POT_MIN_PX = 12

/** Whether every line's box sits inside the clear radius, corners included. */
function centreFits(frame: HTMLElement, lines: HTMLElement) {
  const ring = frame.getBoundingClientRect()
  const cx = ring.left + ring.width / 2
  const cy = ring.top + ring.height / 2
  // viewBox units to screen px: covers any size, and a transformed parent.
  const limit = (CLEAR_RADIUS * ring.width) / 200
  return Array.from(lines.children).every((line) => {
    const box = line.getBoundingClientRect()
    const dx = Math.max(Math.abs(box.left - cx), Math.abs(box.right - cx))
    const dy = Math.max(Math.abs(box.top - cy), Math.abs(box.bottom - cy))
    return Math.hypot(dx, dy) <= limit
  })
}

/**
 * Every property that changes on settle must be interpolable, or it snaps.
 * `fill: none` cannot fade into gold. Measured: the incoming segment went gold
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
}) {
  const { t } = useI18n()
  const frameRef = useRef<HTMLDivElement>(null)
  const linesRef = useRef<HTMLDivElement>(null)
  const potRef = useRef<HTMLSpanElement>(null)
  const slice = 360 / total
  const span = slice - GAP_DEGREES
  const showCentre = size >= 200 && pot !== undefined

  // Before paint, and again once the web fonts land: step the pot down from
  // the cap until every line clears the ring. Set on the element directly, so
  // a parent re-render never resets it between fits.
  useLayoutEffect(() => {
    const frame = frameRef.current
    const lines = linesRef.current
    const figure = potRef.current
    if (!showCentre || !frame || !lines || !figure) return

    const fit = () => {
      for (let px = POT_MAX_PX; px >= POT_MIN_PX; px--) {
        figure.style.fontSize = `${px}px`
        if (centreFits(frame, lines)) return
      }
    }
    fit()

    const fonts = document.fonts
    if (!fonts) return
    let live = true
    void fonts.ready.then(() => live && fit())
    fonts.addEventListener('loadingdone', fit)
    return () => {
      live = false
      fonts.removeEventListener('loadingdone', fit)
    }
  }, [showCentre, pot, currency, t.word.pot, size])
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
    <div ref={frameRef} className="relative shrink-0" style={{ width: size, height: size }} aria-hidden="true">
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

      {/*
        Three equal-height lines, so the pot's own box is centred on the ring.
        DM Mono's ink sits mid-box at line-height 1 (measured: 0.13em above,
        0.15em below), so the figure is optically centred too.
      */}
      {showCentre && (
        <div
          ref={linesRef}
          className="absolute left-1/2 top-1/2 flex flex-col items-center whitespace-nowrap"
          style={{ transform: 'translate(-50%, -50%)' }}
        >
          <span className="label leading-none">{t.word.pot}</span>
          <span ref={potRef} className="num tracking-pot text-cream leading-none my-0.5">
            {pot}
          </span>
          {currency && <span className="label leading-none">{currency}</span>}
        </div>
      )}
    </div>
  )
}
