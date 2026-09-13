/**
 * §8.1: three cards on the first open, then never again.
 *
 * Renders the real <App /> inside an emulated Nimiq Pay, with Tanda's answers
 * replaced: a device that has not seen the cards, one that has, and a server
 * that cannot say.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DEVICE = '7'.repeat(64)
const RING = 'Six friends. Everyone pays in.'
const CUSTODY =
  "Every share is a direct payment from your wallet to another member's, through Nimiq Pay. Tanda is the schedule, the record and the reminder."

function seedNimiqPay() {
  window.nimiqPay = { language: 'en', requestDeviceIdentifier: () => Promise.resolve(DEVICE) }
  window.nimiq = {
    getNetwork: () => 'nimiq',
    getRPC: () => undefined,
    getBlockNumber: async () => 1,
    isConsensusEstablished: async () => true,
  } as unknown as Window['nimiq']
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** Tanda, as far as the first open reaches. `onboarded: null` is a server that cannot say. */
function tanda({ onboarded }: { onboarded: boolean | null }) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)
    if (path === '/api/device') {
      return onboarded === null
        ? json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Could not reach the database.' } }, 503)
        : json({ onboarded })
    }
    if (path === '/api/device/onboarded' && init?.method === 'POST') return json({ onboarded: true })
    if (path === '/api/circles') return json([])
    return json({ error: { code: 'NOT_FOUND', message: 'No route.' } }, 404)
  })
}

let unmount: (() => void) | null = null

async function boot(fetchSpy: ReturnType<typeof tanda>, search = '') {
  vi.resetModules()
  window.history.replaceState(null, '', `/${search}`)
  vi.stubGlobal('fetch', fetchSpy)
  const React = await import('react')
  const rtl = await import('@testing-library/react')
  const { App } = await import('./App')
  const view = rtl.render(React.createElement(App))
  unmount = view.unmount
  // A response resolves through several async steps; give each its turn.
  const settle = async () => {
    for (let i = 0; i < 10; i++) {
      await rtl.act(async () => {
        await vi.advanceTimersByTimeAsync(100)
      })
    }
  }
  await settle()
  return { view, rtl, settle, paths: () => fetchSpy.mock.calls.map(([path]) => String(path)) }
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  seedNimiqPay()
})

afterEach(() => {
  unmount?.()
  unmount = null
  Reflect.deleteProperty(window, 'nimiq')
  Reflect.deleteProperty(window, 'nimiqPay')
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('the first open', () => {
  it('shows the three cards before anything else, with §2’s custody sentence word for word', async () => {
    const app = await boot(tanda({ onboarded: false }))
    const text = app.view.container.textContent ?? ''

    expect(text).toContain(RING)
    expect(text).toContain('Tanda never holds your money.')
    expect(text).toContain(CUSTODY)
    expect(text).toContain('Start a circle, or join one with a code.')
    expect(app.paths()).toEqual(['/api/device'])
  })

  it('ends on two ways in, and choosing one remembers the device, here and on the server', async () => {
    const fetchSpy = tanda({ onboarded: false })
    const app = await boot(fetchSpy)

    const start = app.view.getByRole('link', { name: 'Start a circle' })
    const join = app.view.getByRole('link', { name: 'Join with a code' })
    expect(start.getAttribute('href')).toBe('?create=')
    expect(join.getAttribute('href')).toBe('?join=')

    // jsdom does not navigate; the click is what this is about.
    start.addEventListener('click', (event) => event.preventDefault())
    app.rtl.fireEvent.click(start)
    await app.settle()

    expect(localStorage.getItem('tanda.onboarded')).toBe(DEVICE)
    const dismissed = fetchSpy.mock.calls.find(([path]) => path === '/api/device/onboarded')
    expect(dismissed?.[1]).toMatchObject({ method: 'POST', keepalive: true })
    expect(new Headers(dismissed?.[1]?.headers).get('x-tanda-device')).toBe(DEVICE)
  })

  it('from an invite, puts joining that circle first', async () => {
    const app = await boot(tanda({ onboarded: false }), '?join=K7MPQ4')
    const links = app.view.getAllByRole('link')

    expect(links.map((a) => a.textContent)).toEqual(['Join with a code', 'Start a circle'])
    expect(links[0].getAttribute('href')).toBe('?join=K7MPQ4')
  })
})

describe('every open after', () => {
  it('goes straight in on a device that has seen the cards, without asking Tanda again', async () => {
    localStorage.setItem('tanda.onboarded', DEVICE)
    const app = await boot(tanda({ onboarded: false }))

    expect(app.view.container.textContent).not.toContain(RING)
    expect(app.view.container.querySelector('h1')?.textContent).toBe('No circles yet')
    expect(app.paths()).toEqual(['/api/circles'])
  })

  it('goes straight in when Tanda already knows the device, and remembers it here', async () => {
    const app = await boot(tanda({ onboarded: true }))

    expect(app.view.container.textContent).not.toContain(RING)
    expect(app.view.container.querySelector('h1')?.textContent).toBe('No circles yet')
    expect(localStorage.getItem('tanda.onboarded')).toBe(DEVICE)
  })

  it('opens the app rather than stalling when Tanda cannot say', async () => {
    const app = await boot(tanda({ onboarded: null }))

    expect(app.view.container.textContent).not.toContain(RING)
    expect(app.paths()).toContain('/api/circles')
  })
})
