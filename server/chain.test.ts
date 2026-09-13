// @vitest-environment node
/**
 * Chain checks, with the indexer replaced by its real response shapes: the
 * fields and the hex memo encoding are copied from payments on mainnet, and
 * the addresses and memos are made up.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { decodeMemo, findPayment, verifyTransfer } from './chain.js'
import { paymentMemo } from './domain.js'

const SHARE_ID = '5a1e0001-0000-4000-8000-000000000000'
const OTHER_SHARE_ID = 'ffff0000-0000-4000-8000-000000000000'
const MEMO = paymentMemo(2, SHARE_ID)
const PAYER = 'NQ12 AAAA AAAA AAAA AAAA AAAA AAAA AAAA AAAA'
const PAYERS_OTHER_ACCOUNT = 'NQ34 BBBB BBBB BBBB BBBB BBBB BBBB BBBB BBBB'
const RECIPIENT = 'NQ56 CCCC CCCC CCCC CCCC CCCC CCCC CCCC CCCC'
const HASH = 'ab'.repeat(32)

const hex = (text: string) => Buffer.from(text, 'utf8').toString('hex')

/** A transaction as the indexer returns it. */
const tx = (over: Record<string, unknown> = {}) => ({
  hash: HASH,
  sender_address: PAYERS_OTHER_ACCOUNT,
  receiver_address: RECIPIENT,
  value: 100_000,
  fee: 0,
  executed: true,
  confirmations: 12,
  timestamp: 1_789_000_000,
  data: hex(MEMO),
  ...over,
})

function indexer(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('paymentMemo', () => {
  it('names the round and the share, and never the circle code', () => {
    expect(MEMO).toBe('tanda r2 5a1e0001')
  })
})

describe('decodeMemo', () => {
  it('reads the hex the indexer returns', () => {
    expect(decodeMemo(hex('tanda r1 00ff00ff'))).toBe('tanda r1 00ff00ff')
  })

  it('reads nothing from an empty or malformed field', () => {
    expect(decodeMemo('')).toBe('')
    expect(decodeMemo(null)).toBe('')
    expect(decodeMemo('not hex')).toBe('')
  })
})

describe('verifyTransfer', () => {
  const share = { txHash: HASH, from: PAYER, to: RECIPIENT, amountLuna: 100_000, memo: MEMO }

  it('verifies a payment from another account in the payer’s wallet when its memo names the share', async () => {
    indexer(tx())
    expect(await verifyTransfer(share)).toEqual({ verified: true, confirmations: 12 })
  })

  it('verifies a payment with no memo when it came from the address the payer joined with', async () => {
    indexer(tx({ sender_address: PAYER, data: '' }))
    expect(await verifyTransfer(share)).toMatchObject({ verified: true })
  })

  it('fails closed on a payment naming a different share, from a different account', async () => {
    indexer(tx({ data: hex(paymentMemo(2, OTHER_SHARE_ID)) }))
    expect(await verifyTransfer(share)).toEqual({ verified: false, reason: 'mismatch' })
  })

  it('fails closed on the right memo paying someone else, or paying too little', async () => {
    indexer(tx({ receiver_address: PAYER }))
    expect(await verifyTransfer(share)).toEqual({ verified: false, reason: 'mismatch' })
    indexer(tx({ value: 99_999 }))
    expect(await verifyTransfer(share)).toEqual({ verified: false, reason: 'mismatch' })
  })

  it('reports a hash the indexer does not have yet as not found', async () => {
    indexer({ error: true, statusCode: 404 }, 404)
    expect(await verifyTransfer(share)).toEqual({ verified: false, reason: 'not_found' })
  })
})

describe('findPayment', () => {
  const share = { to: RECIPIENT, amountLuna: 100_000, memo: MEMO }

  it('finds the share’s payment among the recipient’s transactions by its memo', async () => {
    indexer([tx({ hash: 'cd'.repeat(32), data: hex(paymentMemo(2, OTHER_SHARE_ID)) }), tx({ hash: 'EF'.repeat(32) })])
    expect(await findPayment(share)).toEqual({ found: true, txHash: 'ef'.repeat(32) })
  })

  it('ignores the memo on a payment to someone else, for too little, or that did not execute', async () => {
    indexer([tx({ receiver_address: PAYER }), tx({ value: 1 }), tx({ executed: false })])
    expect(await findPayment(share)).toEqual({ found: false, reason: 'not_found' })
  })

  it('says so when the indexer cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed')
      }),
    )
    expect(await findPayment(share)).toEqual({ found: false, reason: 'unreachable' })
  })
})
