// @vitest-environment node
/**
 * The circle as the server gives it out, against a real database (PGlite, in
 * memory) with the indexer replaced.
 *
 *  - Someone holding a code who is not in the circle never gets an address, a
 *    hash or a round, and gets no names once the seats have filled.
 *  - A payment the app never heard back about is found by its memo, recorded
 *    and verified, and one payment cannot count for two shares.
 *  - A payment recorded before the indexer had it verifies on a later read,
 *    without the indexer being asked on every read.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

type Service = typeof import('./service.js')
let service: Service

beforeAll(async () => {
  delete process.env.DATABASE_URL
  process.env.TANDA_PGLITE_DIR = 'memory://'
  const { migrateToLatest } = await import('./db/client.js')
  await migrateToLatest()
  service = await import('./service.js')
}, 60_000)

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const device = (n: number) => `device-${n}`.padEnd(64, '0')
const address = (letter: string) => `NQ00 ${Array(8).fill(letter.repeat(4)).join(' ')}`
const ANA = address('A')
const BO = address('B')
const CY = address('C')
const SHARE_LUNA = 100_000
const hex = (text: string) => Buffer.from(text, 'utf8').toString('hex')

/** Replace the indexer. Returns the spy, so a test can count what was asked. */
function indexer(respond: (url: string) => { status?: number; body: unknown }) {
  const spy = vi.fn(async (input: RequestInfo | URL) => {
    const { status = 200, body } = respond(String(input))
    return new Response(JSON.stringify(body), { status })
  })
  vi.stubGlobal('fetch', spy)
  return spy
}

const paymentTo = (to: string, memo: string, hash: string) => ({
  hash,
  sender_address: 'NQ99 ZZZZ ZZZZ ZZZZ ZZZZ ZZZZ ZZZZ ZZZZ ZZZZ',
  receiver_address: to,
  value: SHARE_LUNA,
  fee: 0,
  executed: true,
  confirmations: 3,
  timestamp: 1_789_000_000,
  data: hex(memo),
})

async function formingCircle() {
  const created = await service.createCircle({
    name: 'Terms only',
    shareAmount: SHARE_LUNA,
    frequency: 'weekly',
    memberCount: 3,
    displayName: 'Ana',
    address: ANA,
    deviceId: device(1),
  })
  return created.circle.code
}

async function activeCircle() {
  const code = await formingCircle()
  await service.joinCircle({ code, displayName: 'Bo', address: BO, deviceId: device(2) })
  await service.joinCircle({ code, displayName: 'Cy', address: CY, deviceId: device(3) })
  return code
}

describe('what someone outside the circle can read', () => {
  it('sees the terms and the rotation by name while seats are open, and no address', async () => {
    const code = await formingCircle()

    for (const viewer of [device(9), null]) {
      const view = await service.readCircle(code, viewer)
      expect(view.you).toBeNull()
      expect(view.members.map((m) => [m.position, m.displayName])).toEqual([[1, 'Ana']])
      expect(JSON.stringify(view)).not.toContain(ANA)
    }
  })

  it('sees nothing of the members, the rounds or the payments once the circle is full', async () => {
    const code = await activeCircle()

    const outsider = await service.readCircle(code, device(9))
    expect(outsider.circle.status).toBe('active')
    expect(outsider.members).toEqual([])
    expect(outsider.round).toBeNull()
    expect(outsider.history).toEqual([])
    expect(JSON.stringify(outsider)).not.toMatch(/NQ00|Ana|Bo|Cy/)

    const member = await service.readCircle(code, device(2))
    expect(member.members.map((m) => m.address)).toEqual([ANA, BO, CY])
    expect(member.round?.shares.every((s) => /^tanda r1 [0-9a-f]{8}$/.test(s.memo))).toBe(true)
  })
})

describe('a payment the app never heard back about', () => {
  it('is found by its memo, recorded as sent and verified, and cannot count for a second share', async () => {
    const code = await activeCircle()
    const view = await service.readCircle(code, device(2))
    const bos = view.round!.shares.find((s) => s.isMine)!
    const hash = 'ab'.repeat(32)
    indexer(() => ({ body: [paymentTo(ANA, bos.memo, hash)] }))

    expect(await service.findSent({ code, shareId: bos.id, deviceId: device(2) })).toMatchObject({ found: true })

    const after = await service.readCircle(code, device(1))
    const share = after.round!.shares.find((s) => s.id === bos.id)!
    expect(share.txHash).toBe(hash)
    expect(share.verifiedAt).not.toBeNull()

    const cys = after.round!.shares.find((s) => s.payer?.displayName === 'Cy')!
    await expect(service.recordSent({ code, shareId: cys.id, txHash: hash, deviceId: device(3) })).rejects.toMatchObject({
      code: 'TX_HASH_USED',
    })
  })

  it('reports not found when the chain has nothing with the memo, and records nothing', async () => {
    const code = await activeCircle()
    const bos = (await service.readCircle(code, device(2))).round!.shares.find((s) => s.isMine)!
    indexer(() => ({ body: [paymentTo(ANA, 'tanda r1 00000000', 'cd'.repeat(32))] }))

    expect(await service.findSent({ code, shareId: bos.id, deviceId: device(2) })).toEqual({
      found: false,
      reason: 'not_found',
    })
    const share = (await service.readCircle(code, device(2))).round!.shares.find((s) => s.id === bos.id)!
    expect(share.txHash).toBeNull()
  })

  it('can only be looked for by the member whose share it is', async () => {
    const code = await activeCircle()
    const bos = (await service.readCircle(code, device(2))).round!.shares.find((s) => s.isMine)!
    await expect(service.findSent({ code, shareId: bos.id, deviceId: device(3) })).rejects.toMatchObject({
      code: 'NOT_YOUR_SHARE',
    })
  })
})

describe('a payment recorded before the indexer had it', () => {
  it('verifies on a later read, asking the indexer at most once every 20 seconds', async () => {
    const code = await activeCircle()
    const bos = (await service.readCircle(code, device(2))).round!.shares.find((s) => s.isMine)!
    const hash = 'ef'.repeat(32)

    let indexed = false
    const spy = indexer((url) =>
      indexed && url.endsWith(`/transaction/${hash}`)
        ? { body: paymentTo(ANA, bos.memo, hash) }
        : { status: 404, body: { error: true } },
    )

    await service.recordSent({ code, shareId: bos.id, txHash: hash, deviceId: device(2) })
    const shareFor = async (viewer: number) =>
      (await service.readCircle(code, device(viewer))).round!.shares.find((s) => s.id === bos.id)!
    expect((await shareFor(1)).verifiedAt).toBeNull()

    // The indexer catches up. A read straight away does not ask again.
    indexed = true
    const asked = spy.mock.calls.length
    expect((await shareFor(1)).verifiedAt).toBeNull()
    expect(spy.mock.calls.length).toBe(asked)

    // Twenty seconds on, a read asks once, and the share verifies.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 21_000)
    expect((await shareFor(1)).verifiedAt).not.toBeNull()
    expect(spy.mock.calls.length).toBe(asked + 1)
  })
})
