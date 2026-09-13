/**
 * §8.6 and §11: a payment the wallet did not send never becomes a row, and a
 * payment it did send is never paid twice.
 *
 * Drives the real payShare → sendShare → SDK path against an injected
 * provider, with the answers a host might give instead of a transaction. Each
 * must land on a named failure with nothing stashed, and an answer Tanda does
 * not recognise must carry the wallet's own words, because on a real phone
 * that is the only way to learn what it was.
 *
 * The second half is the double payment from the three-phone test: the wallet
 * sent, the app never heard, and the payer tapped again. Before the wallet can
 * open a second time, Tanda has to look on chain for the first payment.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Answer = () => Promise<unknown>

const SHARE = 'share-1'
const DEVICE = '9'.repeat(64)
const HASH = 'ab'.repeat(32)

function seedProvider(answer: Answer) {
  window.nimiq = {
    getNetwork: () => 'nimiq',
    getRPC: () => undefined,
    getBlockNumber: async () => 1,
    isConsensusEstablished: async () => true,
    sendBasicTransaction: answer,
    sendBasicTransactionWithData: answer,
  } as unknown as Window['nimiq']
}

/** A fresh app with a wallet that gives `answer`. `session` opens the wallet gate, so Tanda can be asked. */
async function load(answer: Answer, { session = false, gaps = [0] } = {}) {
  vi.resetModules()
  const wallet = vi.fn(answer)
  seedProvider(wallet)
  if (session) (await import('./session')).openSession(DEVICE)
  const { payShare } = await import('./pay')
  const pay = () =>
    payShare({
      code: 'K7MPQ4',
      shareId: SHARE,
      recipient: 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000',
      payerAddress: 'NQ12 AAAA AAAA AAAA AAAA AAAA AAAA AAAA AAAA',
      memo: 'tanda r1 5a1e0001',
      nim: 1,
      deviceId: DEVICE,
      lookupGapsMs: gaps,
    })
  return { pay, wallet }
}

const VIEW = { circle: { code: 'K7MPQ4' }, you: null, members: [], round: null, history: [] }
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })

/** Tanda's answers. `onChain` is whether the indexer has this share's payment. */
function server({ onChain }: { onChain: boolean }) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith(`/shares/${SHARE}/find`)) {
      return json(onChain ? { found: true, ...VIEW } : { found: false, reason: 'not_found' })
    }
    if (url.endsWith(`/shares/${SHARE}/sent`)) return json({ ...VIEW, verification: { verified: false } })
    return json({})
  })
}

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchSpy = server({ onChain: false })
  vi.stubGlobal('fetch', fetchSpy)
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete (window as { nimiq?: unknown }).nimiq
})

const calledPaths = () => fetchSpy.mock.calls.map(([input]) => new URL(String(input), 'http://x').pathname)

function expectNothingRecorded() {
  expect(calledPaths().filter((path) => path.endsWith('/sent'))).toEqual([])
  expect(localStorage.getItem('tanda.unreported') ?? '[]').not.toContain(SHARE)
}

describe('a send the wallet did not complete', () => {
  it('keeps the wallet’s own words when it refuses for a reason Tanda does not recognise', async () => {
    const { pay } = await load(async () => ({
      error: { type: 'GENERIC_ERROR', message: 'Transaction could not be sent' },
    }))
    const outcome = await pay()
    expect(outcome).toMatchObject({ ok: false, failure: { kind: 'wallet' } })
    const detail = !outcome.ok && outcome.failure.kind === 'wallet' ? outcome.failure.detail : ''
    expect(detail).toContain('GENERIC_ERROR')
    expect(detail).toContain('Transaction could not be sent')
    expectNothingRecorded()
  })

  it('names a cancellation as a cancellation', async () => {
    const { pay } = await load(async () => ({ error: { type: 'USER_CANCELED', message: 'Rejected by user' } }))
    expect(await pay()).toMatchObject({ ok: false, failure: { kind: 'cancelled' } })
    expectNothingRecorded()
  })

  it('treats an error that is a bare string as an error, never as a transaction', async () => {
    const { pay } = await load(async () => ({ error: 'Insufficient funds' }))
    expect(await pay()).toMatchObject({ ok: false, failure: { kind: 'insufficient' } })
    expectNothingRecorded()
  })

  it('treats a send that resolves with nothing as not sent', async () => {
    const { pay } = await load(async () => null)
    const outcome = await pay()
    expect(outcome).toMatchObject({ ok: false, failure: { kind: 'wallet' } })
    const detail = !outcome.ok && outcome.failure.kind === 'wallet' ? outcome.failure.detail : ''
    expect(detail).toContain('UNEXPECTED_RESULT')
    expectNothingRecorded()
  })

  it('keeps the message when the provider throws instead of answering', async () => {
    const { pay } = await load(async () => {
      throw new TypeError('sendBasicTransactionWithData is not supported')
    })
    const outcome = await pay()
    expect(outcome).toMatchObject({ ok: false, failure: { kind: 'wallet' } })
    const detail = !outcome.ok && outcome.failure.kind === 'wallet' ? outcome.failure.detail : ''
    expect(detail).toContain('sendBasicTransactionWithData is not supported')
    expectNothingRecorded()
  })
})

describe('a payment the app never heard back about', () => {
  it('is found on chain after an unreadable answer, instead of being reported as not sent', async () => {
    fetchSpy = server({ onChain: true })
    vi.stubGlobal('fetch', fetchSpy)
    const { pay, wallet } = await load(async () => ({ error: { type: 'TIMEOUT', message: 'No response' } }), {
      session: true,
    })

    expect(await pay()).toMatchObject({ ok: true })
    expect(wallet).toHaveBeenCalledTimes(1)
    expect(calledPaths()).toEqual([`/api/circles/K7MPQ4/shares/${SHARE}/find`])
  })

  it('is looked for on the next tap, before the wallet opens a second time', async () => {
    const { pay, wallet } = await load(() => new Promise(() => {}), { session: true })
    // The first tap opened the wallet, and the app never got an answer.
    void pay()
    await vi.waitFor(() => expect(wallet).toHaveBeenCalledTimes(1))

    fetchSpy = server({ onChain: true })
    vi.stubGlobal('fetch', fetchSpy)
    expect(await pay()).toMatchObject({ ok: true })
    expect(wallet).toHaveBeenCalledTimes(1)
  })

  it('lets the wallet open again when the chain has nothing, after one more look rather than the full wait', async () => {
    let answers = 0
    const { pay, wallet } = await load(
      async () => (++answers === 1 ? { error: { type: 'TIMEOUT', message: 'No response' } } : HASH),
      { session: true, gaps: [0, 0] },
    )
    const find = `/api/circles/K7MPQ4/shares/${SHARE}/find`

    // The unreadable answer: the full schedule of looks, two here.
    expect(await pay()).toMatchObject({ ok: false, failure: { kind: 'wallet' } })
    // Try again: that search already ran, so one look, then the wallet.
    expect(await pay()).toMatchObject({ ok: true, txHash: HASH })
    expect(wallet).toHaveBeenCalledTimes(2)
    expect(calledPaths()).toEqual([find, find, find, `/api/circles/K7MPQ4/shares/${SHARE}/sent`])
  })

  it('does not make a cancelled attempt wait on the chain the next time', async () => {
    let answers = 0
    const { pay, wallet } = await load(
      async () => (++answers === 1 ? { error: { type: 'USER_CANCELED', message: 'Rejected by user' } } : HASH),
      { session: true },
    )

    expect(await pay()).toMatchObject({ ok: false, failure: { kind: 'cancelled' } })
    expect(await pay()).toMatchObject({ ok: true })
    expect(wallet).toHaveBeenCalledTimes(2)
    expect(calledPaths()).toEqual([`/api/circles/K7MPQ4/shares/${SHARE}/sent`])
  })
})
