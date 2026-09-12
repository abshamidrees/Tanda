/**
 * The app icon, generated from geometry (docs/BRIEF.md §20). Never an image
 * model: small arcs and exact gaps garble. Writes public/icon.svg, then
 * rasterises it to public/icon-512.png and public/icon-64.png with Playwright.
 *
 *   npm run icon                       as specified: gold arc 190 / 104
 *   npm run icon -- --gold 198,96      re-export with a thicker gold arc
 */
import { writeFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'

const CENTRE = 256
const BASE = { outer: 176, inner: 112 }
const SPAN = 54 // degrees of arc per segment; with 6 of gap, centres sit 60 apart
const COLOURS = {
  ground: '#14101A',
  mint: '#4ADE9B',
  gold: '#F6B221',
  hairline: '#3A3143',
  cream: '#FFF6E8',
}

const goldArg = process.argv.indexOf('--gold')
const [goldOuter, goldInner] =
  goldArg === -1 ? [190, 104] : process.argv[goldArg + 1].split(',').map(Number)

/** SVG angles: 0 is 3 o'clock and positive runs clockwise, so -90 is 12 o'clock. */
const point = (degrees, radius) => {
  const r = (degrees * Math.PI) / 180
  const round = (n) => Number(n.toFixed(3))
  return `${round(CENTRE + radius * Math.cos(r))} ${round(CENTRE + radius * Math.sin(r))}`
}

/** Two arcs and two radial lines, closed: the ends are flat radial cuts. */
const segment = (centreDegrees, outer, inner) => {
  const from = centreDegrees - SPAN / 2
  const to = centreDegrees + SPAN / 2
  return [
    `M ${point(from, outer)}`,
    `A ${outer} ${outer} 0 0 1 ${point(to, outer)}`,
    `L ${point(to, inner)}`,
    `A ${inner} ${inner} 0 0 0 ${point(from, inner)}`,
    'Z',
  ].join(' ')
}

const SEGMENTS = [
  { at: -90, paint: `fill="${COLOURS.mint}"` }, // settled
  { at: -30, paint: `fill="${COLOURS.mint}"` }, // settled
  { at: 30, paint: `fill="${COLOURS.gold}"`, proud: true }, // the current turn
  { at: 90, paint: `fill="none" stroke="${COLOURS.hairline}" stroke-width="10"` }, // ahead
  { at: 150, paint: `fill="none" stroke="${COLOURS.hairline}" stroke-width="10"` }, // ahead
  { at: 210, paint: `fill="none" stroke="${COLOURS.hairline}" stroke-width="10"` }, // ahead
]

const paths = SEGMENTS.map(({ at, paint, proud }) => {
  const d = proud ? segment(at, goldOuter, goldInner) : segment(at, BASE.outer, BASE.inner)
  return `    <path d="${d}" ${paint}/>`
}).join('\n')

// The viewer's own position: the midpoint of segment 5's band.
const [markerX, markerY] = point(150, (BASE.outer + BASE.inner) / 2).split(' ')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect x="0" y="0" width="512" height="512" rx="112" fill="${COLOURS.ground}"/>
  <g stroke-linejoin="round">
${paths}
  </g>
  <circle cx="${markerX}" cy="${markerY}" r="13" fill="${COLOURS.cream}"/>
</svg>
`

await writeFile('public/icon.svg', svg)

const browser = await chromium.launch({ channel: 'msedge' })
try {
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  for (const size of [512, 64]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
    await page.setContent(
      `<!doctype html><body style="margin:0;background:transparent">` +
        `<img id="icon" src="${src}" width="${size}" height="${size}" style="display:block"></body>`,
    )
    await page.waitForFunction(() => document.getElementById('icon').complete)
    // omitBackground keeps the corners outside the rounded rect transparent.
    await page.screenshot({
      path: `public/icon-${size}.png`,
      omitBackground: true,
      clip: { x: 0, y: 0, width: size, height: size },
    })
    await page.close()
  }
} finally {
  await browser.close()
}

console.log(`icon: gold arc ${goldOuter}/${goldInner} -> public/icon.svg, icon-512.png, icon-64.png`)
