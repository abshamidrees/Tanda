/**
 * §8.6 and §11: a payment the wallet did not send never becomes a row.
 *
 * Drives the real payShare → sendShare → SDK path against an injected
 * provider, with the answers a host might give instead of a transaction. Each
 * must land on a named failure with nothing stashed and nothing sent to the
 * server, and an answer Tanda does not recognise must carry the wallet's own
 * words, because on a real phone that is the only way to learn what it was.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Answer = () => Promise<unknown>

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

async function pay(answer: Answer) {
  vi.resetModules()
  seedProvider(answer)
  const { payShare } = await import('./pay')
  return payShare({
    code: 'K7MPQ4',
    shareId: 'share-1',
    recipient: 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000',
    payerAddress: 'NQ12 AAAA AAAA AAAA AAAA AAAA AAAA AAAA AAAA',
    nim: 1,
    roundNumber: 1,
    deviceId: '9'.repeat(64),
  })
}

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }))
  vi.stubGlobal('fetch', fetchSpy)
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete (window as { nimiq?: unknown }).nimiq
})

function expectNothingRecorded() {
  expect(fetchSpy).not.toHaveBeenCalled()
  expect(localStorage.getItem('tanda.unreported') ?? '[]').not.toContain('share-1')
}

describe('a send the wallet did not complete', () => {
  it('keeps the wallet’s own words when it refuses for a reason Tanda does not recognise', async () => {
    const outcome = await pay(async () => ({
      error: { type: 'GENERIC_ERROR', message: 'Transaction could not be sent' },
    }))
    expect(outcome).toMatchObject({ ok: false, failure: { kind: 'wallet' } })
    const detail = !outcome.ok && outcome.failure.kind === 'wallet' ? outcome.failure.detail : ''
    expect(detail).toContain('GENERIC_ERROR')
    expect(detail).toContain('Transaction could not be sent')
    expectNothingRecorded()
  })

  it('names a cancellation as a cancellation', async () => {
    const outcome = await pay(async () => ({ error: { type: 'USER_CANCELED', message: 'Rejected by user' } }))
    expect(outcome).toMatchObject({ ok: false, failure: { kind: 'cancelled' } })
    expectNothingRecorded()
  })

  it('treats an error that is a bare string as an error, never as a transaction', async () => {
    const outcome = await pay(async () => ({ error: 'Insufficient funds' }))
    expect(outcome).toMatchObject({ ok: false, failure: { kind: 'insufficient' } })
    expectNothingRecorded()
  })

  it('treats a send that resolves with nothing as not sent', async () => {
    const outcome = await pay(async () => null)
    expect(outcome).toMatchObject({ ok: false, failure: { kind: 'wallet' } })
    const detail = !outcome.ok && outcome.failure.kind === 'wallet' ? outcome.failure.detail : ''
    expect(detail).toContain('UNEXPECTED_RESULT')
    expectNothingRecorded()
  })

  it('keeps the message when the provider throws instead of answering', async () => {
    const outcome = await pay(async () => {
      throw new TypeError('sendBasicTransactionWithData is not supported')
    })
    expect(outcome).toMatchObject({ ok: false, failure: { kind: 'wallet' } })
    const detail = !outcome.ok && outcome.failure.kind === 'wallet' ? outcome.failure.detail : ''
    expect(detail).toContain('sendBasicTransactionWithData is not supported')
    expectNothingRecorded()
  })
})
