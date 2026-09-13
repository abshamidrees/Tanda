/**
 * §10 and §11: the wallet gate takes precedence over everything.
 *
 * Renders the real <App /> for each way a visitor can arrive, with `fetch`
 * replaced by a spy that fails every call, the way production does while the
 * database is down. What is under test is not only what shows, but that
 * nothing is fetched until the gate has resolved inside Nimiq Pay with an
 * identity the host issued — because a request that is never sent cannot
 * render its error over the gate.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const HOST_DEVICE = '9'.repeat(64)
const CARD = 'Tanda runs inside Nimiq Pay'
const CONNECTING = 'Connecting to your wallet'
const NETWORK = 'Waiting for the network'
const UNREACHABLE = 'Could not reach Tanda'

/** Nimiq Pay's host context, which it seeds before any page script runs. */
function seedHost(identity: 'granted' | 'declined' = 'granted') {
  window.nimiqPay = {
    language: 'en',
    requestDeviceIdentifier: () =>
      identity === 'granted' ? Promise.resolve(HOST_DEVICE) : Promise.reject(new Error('Declined')),
  }
}

/** The injected provider. On its own it proves nothing about being inside Nimiq Pay. */
function seedProvider(consensus = true) {
  window.nimiq = {
    getNetwork: () => 'nimiq',
    getRPC: () => undefined,
    getBlockNumber: async () => 1,
    isConsensusEstablished: async () => consensus,
  } as unknown as Window['nimiq']
}

const failingFetch = () =>
  vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Could not reach the database.' } }),
        { status: 503, headers: { 'content-type': 'application/json' } },
      ),
  )

let unmount: (() => void) | null = null

/** A fresh app, as a page load would give: no memoised provider, no session. */
async function boot() {
  vi.resetModules()
  const fetchSpy = failingFetch()
  vi.stubGlobal('fetch', fetchSpy)

  const React = await import('react')
  const rtl = await import('@testing-library/react')
  const { App } = await import('./App')
  const view = rtl.render(React.createElement(App))
  unmount = view.unmount

  return {
    fetchSpy,
    heading: () => view.container.querySelector('h1')?.textContent ?? null,
    line: () => view.container.querySelector('h1')?.nextElementSibling?.textContent ?? null,
    text: () => view.container.textContent ?? '',
    buttons: () => [...view.container.querySelectorAll('button')].map((b) => b.textContent),
    advance: (ms: number) =>
      rtl.act(async () => {
        await vi.advanceTimersByTimeAsync(ms)
      }),
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  unmount?.()
  unmount = null
  Reflect.deleteProperty(window, 'nimiq')
  Reflect.deleteProperty(window, 'nimiqPay')
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('outside Nimiq Pay, the card is the whole app', () => {
  it('a phone or laptop browser sees the card from the first paint, and nothing else, ever', async () => {
    const app = await boot()

    expect(app.heading()).toBe(CARD)
    expect(app.text()).not.toContain(CONNECTING)

    // Past every timer the gate owns: the late-host window, the 8s retry offer,
    // the 60s provider wait. Nothing replaces the card and nothing is fetched.
    for (const ms of [500, 3_000, 8_000, 60_000]) {
      await app.advance(ms)
      expect(app.heading()).toBe(CARD)
      expect(app.text()).not.toContain(UNREACHABLE)
    }
    expect(app.fetchSpy).not.toHaveBeenCalled()
  })

  it('an injected provider without the Nimiq Pay host still gets only the card', async () => {
    // Reproduced on production: this used to open a session with an invented
    // identity and fetch /api/circles three times.
    seedProvider()
    const app = await boot()

    expect(app.heading()).toBe(CARD)
    await app.advance(70_000)
    expect(app.heading()).toBe(CARD)
    expect(app.fetchSpy).not.toHaveBeenCalled()
  })

  it('a host that seeds its context late takes over from the card, and only then fetches', async () => {
    const app = await boot()
    expect(app.heading()).toBe(CARD)

    await app.advance(500)
    expect(app.fetchSpy).not.toHaveBeenCalled()

    seedHost()
    seedProvider()
    await app.advance(500)

    expect(app.heading()).not.toBe(CARD)
    expect(app.fetchSpy).toHaveBeenCalled()
  })
})

describe('inside Nimiq Pay, nothing is fetched until the gate resolves', () => {
  it('while the provider is missing: connecting, the retry offered at 8 seconds, no fetch', async () => {
    seedHost()
    const app = await boot()

    expect(app.heading()).toBe(CONNECTING)
    expect(app.buttons()).toEqual([])

    await app.advance(8_000)
    expect(app.buttons()).toContain('Try again')

    await app.advance(60_000)
    expect(app.heading()).toBe(CONNECTING)
    expect(app.fetchSpy).not.toHaveBeenCalled()
  })

  it('before consensus: waiting for the network, no fetch', async () => {
    seedHost()
    seedProvider(false)
    const app = await boot()

    await app.advance(100)
    expect(app.heading()).toBe(NETWORK)

    await app.advance(10_000)
    expect(app.heading()).toBe(NETWORK)
    expect(app.fetchSpy).not.toHaveBeenCalled()
  })

  it('when the identity prompt is declined, no identity is invented and nothing is fetched', async () => {
    seedHost('declined')
    seedProvider()
    const app = await boot()

    await app.advance(100)
    expect(app.heading()).toBe(CONNECTING)
    expect(app.buttons()).toContain('Try again')

    await app.advance(10_000)
    expect(app.fetchSpy).not.toHaveBeenCalled()
  })

  it('with an identity, the first request carries it, and a failure on home reads neutrally', async () => {
    seedHost()
    seedProvider()
    const app = await boot()

    expect(app.heading()).toBe(CONNECTING)
    expect(app.fetchSpy).not.toHaveBeenCalled()

    await app.advance(100)
    expect(app.fetchSpy).toHaveBeenCalled()
    const [url, init] = app.fetchSpy.mock.calls[0]
    expect(url).toBe('/api/circles')
    expect(new Headers(init?.headers).get('x-tanda-device')).toBe(HOST_DEVICE)

    // One retry, then the designed state, within seconds rather than after a long "reading".
    await app.advance(3_000)
    expect(app.heading()).toBe(UNREACHABLE)
    expect(app.line()).toBe('Check your connection and try again.')
    expect(app.text()).not.toMatch(/payment/i)
    expect(app.fetchSpy).toHaveBeenCalledTimes(2)
  })
})

describe('the API client', () => {
  it('sends nothing before the session opens, whoever calls it', async () => {
    vi.resetModules()
    const fetchSpy = failingFetch()
    vi.stubGlobal('fetch', fetchSpy)
    const { api } = await import('../lib/api')
    const { openSession } = await import('../lib/session')

    await expect(api.listCircles(HOST_DEVICE)).rejects.toMatchObject({ code: 'NO_SESSION' })
    await expect(api.readCircle('K7MPQ4', HOST_DEVICE)).rejects.toMatchObject({ code: 'NO_SESSION' })
    expect(fetchSpy).not.toHaveBeenCalled()

    openSession(HOST_DEVICE)
    await expect(api.listCircles(HOST_DEVICE)).rejects.toMatchObject({ code: 'DATABASE_UNAVAILABLE' })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
