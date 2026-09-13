/**
 * The mark, generated from geometry (docs/BRIEF.md §20). Never an image model:
 * small arcs and exact gaps garble. One ring, exported as every §20 variant:
 *
 *   public/icon.svg, icon-512.png, icon-64.png   the app icon
 *   public/mark.svg                              transparent, no rounded rect, for the wordmark lockup
 *   public/mark-mono.svg                         every segment stroked currentColor, no fills, no marker
 *   public/og.png                                1200x630: the mark above the wordmark and the line
 *
 *   npm run icon                       as specified: gold arc 190 / 104
 *   npm run icon -- --gold 198,96      re-export with a thicker gold arc
 */
import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'

const CENTRE = 256
const BASE = { outer: 176, inner: 112 }
const SPAN = 54 // degrees of arc per segment; with 6 of gap, centres sit 60 apart
const STROKE = 10
const COLOURS = {
  ground: '#14101A',
  mint: '#4ADE9B',
  gold: '#F6B221',
  hairline: '#3A3143',
  cream: '#FFF6E8',
  muted: '#A99DB5',
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
  { at: 90, paint: `fill="none" stroke="${COLOURS.hairline}" stroke-width="${STROKE}"` }, // ahead
  { at: 150, paint: `fill="none" stroke="${COLOURS.hairline}" stroke-width="${STROKE}"` }, // ahead
  { at: 210, paint: `fill="none" stroke="${COLOURS.hairline}" stroke-width="${STROKE}"` }, // ahead
]

const pathOf = ({ at, proud }) =>
  proud ? segment(at, goldOuter, goldInner) : segment(at, BASE.outer, BASE.inner)

// The viewer's own position: the midpoint of segment 5's band.
const [markerX, markerY] = point(150, (BASE.outer + BASE.inner) / 2).split(' ')

/** The ring in colour, with the marker. Shared by the icon and the transparent mark. */
const ring = [
  '  <g stroke-linejoin="round">',
  ...SEGMENTS.map((s) => `    <path d="${pathOf(s)}" ${s.paint}/>`),
  '  </g>',
  `  <circle cx="${markerX}" cy="${markerY}" r="13" fill="${COLOURS.cream}"/>`,
].join('\n')

const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect x="0" y="0" width="512" height="512" rx="112" fill="${COLOURS.ground}"/>
${ring}
</svg>
`

/**
 * The marks lose the canvas, so their box closes in on the ring: square on the
 * same centre, 200 either side, which clears the proud gold arc (190) and the
 * mono mark's stroke around it (195).
 */
const MARK_BOX = `${CENTRE - 200} ${CENTRE - 200} 400 400`

const mark = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="${MARK_BOX}">
${ring}
</svg>
`

const markMono = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="${MARK_BOX}" fill="none" stroke="currentColor" stroke-width="${STROKE}" stroke-linejoin="round">
${SEGMENTS.map((s) => `  <path d="${pathOf(s)}"/>`).join('\n')}
</svg>
`

await writeFile('public/icon.svg', icon)
await writeFile('public/mark.svg', mark)
await writeFile('public/mark-mono.svg', markMono)

const base64 = async (path) => (await readFile(path)).toString('base64')
const mulish = await base64('node_modules/@fontsource-variable/mulish/files/mulish-latin-wght-normal.woff2')
const dmMono = await base64('node_modules/@fontsource/dm-mono/files/dm-mono-latin-500-normal.woff2')

/** §20: ground, the mark at 200px centred above the wordmark, the line under it. Nothing else. */
const og = `<!doctype html><html><head><style>
  @font-face { font-family: Mulish; src: url(data:font/woff2;base64,${mulish}) format('woff2'); font-weight: 200 1000; }
  @font-face { font-family: 'DM Mono'; src: url(data:font/woff2;base64,${dmMono}) format('woff2'); font-weight: 500; }
  html, body { margin: 0; }
  body {
    width: 1200px; height: 630px; background: ${COLOURS.ground};
    display: flex; flex-direction: column; align-items: center; justify-content: center;
  }
  svg { display: block; width: 200px; height: 200px; }
  h1 { margin: 36px 0 0; font: 800 64px/1 Mulish, sans-serif; letter-spacing: -0.03em; color: ${COLOURS.cream}; }
  p { margin: 20px 0 0; font: 500 20px/1 'DM Mono', monospace; color: ${COLOURS.muted}; }
</style></head><body>${mark}<h1>Tanda</h1><p>Save together. Take turns.</p></body></html>`

const browser = await chromium.launch({ channel: 'msedge' })
try {
  const src = `data:image/svg+xml;base64,${Buffer.from(icon).toString('base64')}`
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

  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
  await page.setContent(og)
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready
    return document.fonts.check('800 64px Mulish') && document.fonts.check("500 20px 'DM Mono'")
  })
  if (!loaded) throw new Error('og.png: the brand fonts did not load, so the image would use a fallback face')
  await page.screenshot({ path: 'public/og.png', clip: { x: 0, y: 0, width: 1200, height: 630 } })
  await page.close()
} finally {
  await browser.close()
}

console.log(
  `mark: gold arc ${goldOuter}/${goldInner} -> public/icon.svg, icon-512.png, icon-64.png, mark.svg, mark-mono.svg, og.png`,
)
