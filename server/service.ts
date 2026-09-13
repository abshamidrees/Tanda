/**
 * Circle operations. No payment logic here yet — recording a transaction hash
 * and confirming receipt (§8.6, §8.7) land in a later phase.
 */
import { and, asc, eq, ne } from 'drizzle-orm'
import { db, schema } from './db/client.js'
import { findPayment, verifyTransfer } from './chain.js'
import {
  MAX_MEMBERS,
  MIN_MEMBERS,
  addPeriod,
  generateCode,
  isValidCode,
  lunaToNim,
  normaliseCode,
  paymentMemo,
  potLuna,
  recipientPositionForRound,
  shareState,
} from './domain.js'

const { circles, members, rounds, shares } = schema

type Db = Awaited<ReturnType<typeof db>>
/** The transaction handle drizzle hands the callback. Writes take this, not
 *  the pool, so a half-built circle can never be committed. */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type CircleRow = typeof circles.$inferSelect
type MemberRow = typeof members.$inferSelect
type ShareRecord = typeof shares.$inferSelect

export class HttpError extends Error {
  readonly status: number
  readonly code: string
  /** Facts the client needs to word the error itself, in the user's language. */
  readonly details?: Record<string, unknown>

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
    this.details = details
  }
}

/**
 * Materialise a round and one share row per member. Rounds only exist once
 * open, which is why `rounds.status` needs no 'pending' value (§9).
 */
async function openRound(
  tx: Tx,
  circle: CircleRow,
  roster: MemberRow[],
  number: number,
  opensAt: Date,
) {
  const position = recipientPositionForRound(number, circle.memberCount)
  const recipient = roster.find((m) => m.position === position)
  if (!recipient) throw new HttpError(500, 'ROTATION_BROKEN', `No member at position ${position}.`)

  const [round] = await tx
    .insert(rounds)
    .values({
      circleId: circle.id,
      number,
      recipientMemberId: recipient.id,
      opensAt,
      dueAt: addPeriod(opensAt, circle.frequency),
    })
    .returning()

  await tx.insert(shares).values(
    roster.map((m) => ({
      roundId: round.id,
      payerMemberId: m.id,
      amount: circle.shareAmount,
      // The member who is up never pays themselves. Their share settles on open
      // so the pot arithmetic in §8.3 stays exact. See domain.potLuna.
      ...(m.id === recipient.id
        ? { sentAt: opensAt, confirmedAt: opensAt, confirmedBy: recipient.id }
        : {}),
    })),
  )

  return round
}

export async function createCircle(input: {
  name: string
  shareAmount: number
  frequency: 'weekly' | 'monthly'
  memberCount: number
  displayName: string
  address: string
  deviceId: string
}) {
  if (input.memberCount < MIN_MEMBERS || input.memberCount > MAX_MEMBERS) {
    throw new HttpError(
      400,
      'MEMBER_COUNT_OUT_OF_RANGE',
      `A circle holds ${MIN_MEMBERS} to ${MAX_MEMBERS} members.`,
    )
  }
  if (input.shareAmount <= 0) {
    throw new HttpError(400, 'SHARE_NOT_POSITIVE', 'A share must be more than zero.')
  }

  const conn = await db()

  // Codes are short enough to collide. Retry rather than widen the alphabet.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode()
    const clash = await conn.query.circles.findFirst({ where: eq(circles.code, code) })
    if (clash) continue

    // A circle with no members is not a circle. Both rows or neither.
    await conn.transaction(async (tx) => {
      const [circle] = await tx
        .insert(circles)
        .values({
          code,
          name: input.name,
          shareAmount: input.shareAmount,
          frequency: input.frequency,
          memberCount: input.memberCount,
          status: 'forming',
          createdByDevice: input.deviceId,
        })
        .returning()

      // The creator takes position 1. Order is join sequence, fixed at creation.
      await tx.insert(members).values({
        circleId: circle.id,
        position: 1,
        displayName: input.displayName,
        address: input.address,
        deviceId: input.deviceId,
      })
    })

    return readCircle(code, input.deviceId)
  }

  throw new HttpError(503, 'CODE_EXHAUSTED', 'Could not allocate a code. Try again.')
}

export async function joinCircle(input: {
  code: string
  displayName: string
  address: string
  deviceId: string
}) {
  if (!isValidCode(input.code)) {
    throw new HttpError(400, 'CODE_MALFORMED', 'That is not a valid code.')
  }

  const conn = await db()
  const code = normaliseCode(input.code)
  const circle = await conn.query.circles.findFirst({ where: eq(circles.code, code) })
  if (!circle) throw new HttpError(404, 'CODE_NOT_FOUND', 'No circle with that code.')

  const roster = await conn.query.members.findMany({
    where: eq(members.circleId, circle.id),
    orderBy: asc(members.position),
  })

  // Rejoining from the same device is not an error, it is a page refresh.
  if (roster.some((m) => m.deviceId === input.deviceId)) {
    return readCircle(circle.code, input.deviceId)
  }

  if (circle.status !== 'forming') {
    throw new HttpError(409, 'CIRCLE_CLOSED_TO_JOINS', 'This circle has already started.', {
      memberCount: circle.memberCount,
    })
  }
  if (roster.length >= circle.memberCount) {
    throw new HttpError(409, 'CIRCLE_FULL', 'This circle is full.', {
      memberCount: circle.memberCount,
    })
  }

  const position = roster.length + 1

  // Taking the last seat also starts the circle and opens round 1. If any part
  // of that fails the seat is not taken either, so the circle stays joinable
  // rather than becoming active with no round.
  await conn.transaction(async (tx) => {
    const [joined] = await tx
      .insert(members)
      .values({
        circleId: circle.id,
        position,
        displayName: input.displayName,
        address: input.address,
        deviceId: input.deviceId,
      })
      .returning()

    if (position === circle.memberCount) {
      await tx.update(circles).set({ status: 'active' }).where(eq(circles.id, circle.id))
      await openRound(tx, circle, [...roster, joined], 1, new Date())
    }
  })

  return readCircle(circle.code, input.deviceId)
}

/**
 * What a member has put in and taken out, counted from confirmed records, and
 * split the way their wallet saw it.
 *
 *   sent         shares that actually left their wallet
 *   ownShare     their share in the round they were up: settled at round open
 *                against their own pot, never sent to themselves
 *   contributed  sent + ownShare, which is what makes the pot members x share
 *   received     the pots of rounds they were up in, once settled
 *
 * §8.8 shows all four, so no figure on the closing screen disagrees with the
 * wallet: "sent" matches the wallet, and the difference is named.
 */
function totalsFor(
  memberId: string,
  allRounds: { status: string; recipientMemberId: string; shares: { payerMemberId: string; amount: number; confirmedAt: Date | null }[] }[],
) {
  const confirmedFrom = (rounds: typeof allRounds) =>
    rounds
      .flatMap((round) => round.shares)
      .filter((share) => share.payerMemberId === memberId && share.confirmedAt)
      .reduce((sum, share) => sum + share.amount, 0)

  const contributed = confirmedFrom(allRounds)
  const ownShare = confirmedFrom(allRounds.filter((round) => round.recipientMemberId === memberId))
  const sent = contributed - ownShare

  const received = allRounds
    .filter((round) => round.status === 'settled' && round.recipientMemberId === memberId)
    .flatMap((round) => round.shares)
    .reduce((sum, share) => sum + share.amount, 0)

  return {
    sent,
    sentNim: lunaToNim(sent),
    ownShare,
    ownShareNim: lunaToNim(ownShare),
    contributed,
    contributedNim: lunaToNim(contributed),
    received,
    receivedNim: lunaToNim(received),
  }
}

export async function readCircle(rawCode: string, deviceId: string | null) {
  if (!isValidCode(rawCode)) {
    throw new HttpError(400, 'CODE_MALFORMED', 'That is not a valid code.')
  }

  const conn = await db()
  const code = normaliseCode(rawCode)
  const circle = await conn.query.circles.findFirst({ where: eq(circles.code, code) })
  if (!circle) throw new HttpError(404, 'CODE_NOT_FOUND', 'No circle with that code.')

  const roster = await conn.query.members.findMany({
    where: eq(members.circleId, circle.id),
    orderBy: asc(members.position),
  })

  const allRounds = await conn.query.rounds.findMany({
    where: eq(rounds.circleId, circle.id),
    orderBy: asc(rounds.number),
    with: { shares: true },
  })

  const you = deviceId ? (roster.find((m) => m.deviceId === deviceId) ?? null) : null
  const byId = new Map(roster.map((m) => [m.id, m]))
  const pot = potLuna(circle.memberCount, circle.shareAmount)

  const current = allRounds.find((r) => r.status !== 'settled') ?? null
  const settled = allRounds.filter((r) => r.status === 'settled')

  // Addresses, hashes and rounds are for the people in the circle. Anyone else
  // holding the code gets what §8.4 needs to decide on joining: the terms and,
  // while seats are open, the rotation by name. A code travels further than
  // the invite it came in, and until this change it was written on chain.
  const outsider = you === null
  const listed = outsider && circle.status !== 'forming' ? [] : roster

  if (!outsider && current) await recheckPayments(conn, current, byId)

  const brief = (m: MemberRow | undefined) =>
    m
      ? { id: m.id, position: m.position, displayName: m.displayName, address: outsider ? '' : m.address }
      : null

  return {
    circle: {
      id: circle.id,
      code: circle.code,
      name: circle.name,
      shareAmount: circle.shareAmount,
      shareNim: lunaToNim(circle.shareAmount),
      currency: circle.currency,
      frequency: circle.frequency,
      memberCount: circle.memberCount,
      status: circle.status,
      createdAt: circle.createdAt,
      pot,
      potNim: lunaToNim(pot),
      totalRounds: circle.memberCount,
      seatsRemaining: circle.memberCount - roster.length,
    },
    you: you
      ? {
          memberId: you.id,
          position: you.position,
          displayName: you.displayName,
          address: you.address,
          totals: totalsFor(you.id, allRounds),
        }
      : null,
    members: listed.map((m) => {
      const share = outsider ? undefined : current?.shares.find((s) => s.payerMemberId === m.id)
      const isUp = !outsider && current?.recipientMemberId === m.id
      return {
        id: m.id,
        position: m.position,
        displayName: m.displayName,
        address: outsider ? '' : m.address,
        isYou: you?.id === m.id,
        isUp,
        shareId: share?.id ?? null,
        txHash: share?.txHash ?? null,
        verifiedAt: share?.verifiedAt ?? null,
        state: share ? shareState({ ...share, isRecipient: isUp }) : ('not due' as const),
      }
    }),
    round: current && !outsider
      ? {
          id: current.id,
          number: current.number,
          totalRounds: circle.memberCount,
          status: current.status,
          opensAt: current.opensAt,
          dueAt: current.dueAt,
          recipient: brief(byId.get(current.recipientMemberId)),
          youAreUp: you ? current.recipientMemberId === you.id : false,
          pot,
          potNim: lunaToNim(pot),
          outstanding: current.shares.filter(
            (s) => !s.confirmedAt && s.payerMemberId !== current.recipientMemberId,
          ).length,
          shares: current.shares
            .map((s) => ({
              id: s.id,
              payer: brief(byId.get(s.payerMemberId)),
              amount: s.amount,
              amountNim: lunaToNim(s.amount),
              txHash: s.txHash,
              /** What the payment's memo must say, so the chain can name this share. */
              memo: paymentMemo(current.number, s.id),
              sentAt: s.sentAt,
              confirmedAt: s.confirmedAt,
              verifiedAt: s.verifiedAt,
              isMine: you?.id === s.payerMemberId,
              state: shareState({
                ...s,
                isRecipient: s.payerMemberId === current.recipientMemberId,
              }),
            }))
            .sort((a, b) => (a.payer?.position ?? 0) - (b.payer?.position ?? 0)),
        }
      : null,
    history: (outsider ? [] : settled).map((r) => ({
      number: r.number,
      recipient: brief(byId.get(r.recipientMemberId)),
      pot,
      potNim: lunaToNim(pot),
      settledAt: r.settledAt,
    })),
  }
}

/** How often an unverified payment is looked up again, and for how long (§8.7). */
const RECHECK_EVERY_MS = 20_000
const RECHECK_WITHIN_MS = 60 * 60_000
/** A read waits this long at most; the label can arrive with the next read. */
const RECHECK_TIMEOUT_MS = 2_500

/**
 * A payment is recorded the moment the wallet answers, which is usually before
 * the indexer has it, so the first check says not found. Measured: TEST 2's
 * first payment verifies now, and was recorded unverified. So while a round is
 * open, members' reads look again at recent unverified payments, throttled per
 * share. Updates the rows passed in, so the view built from them is current.
 */
async function recheckPayments(
  conn: Db,
  round: { number: number; recipientMemberId: string; shares: ShareRecord[] },
  byId: Map<string, MemberRow>,
) {
  const recipient = byId.get(round.recipientMemberId)
  if (!recipient) return
  const now = Date.now()

  const due = round.shares.filter(
    (s) =>
      s.txHash &&
      !s.verifiedAt &&
      s.sentAt &&
      now - s.sentAt.getTime() < RECHECK_WITHIN_MS &&
      (!s.checkedAt || now - s.checkedAt.getTime() >= RECHECK_EVERY_MS),
  )

  await Promise.all(
    due.map(async (s) => {
      const check = await verifyTransfer({
        txHash: s.txHash!,
        from: byId.get(s.payerMemberId)?.address ?? '',
        to: recipient.address,
        amountLuna: s.amount,
        memo: paymentMemo(round.number, s.id),
        timeoutMs: RECHECK_TIMEOUT_MS,
      })
      const checkedAt = new Date()
      await conn
        .update(shares)
        .set(check.verified ? { checkedAt, verifiedAt: checkedAt } : { checkedAt })
        .where(eq(shares.id, s.id))
      s.checkedAt = checkedAt
      if (check.verified) s.verifiedAt = checkedAt
    }),
  )
}

/** One payment settles one share. Recording its hash against a second would count it twice. */
async function assertHashUnused(conn: Db, txHash: string, shareId: string) {
  const other = await conn.query.shares.findFirst({
    where: and(eq(shares.txHash, txHash), ne(shares.id, shareId)),
  })
  if (other) {
    throw new HttpError(409, 'TX_HASH_USED', 'That payment is already recorded for another share.')
  }
}

/** Mark a share sent and move the round on, in one transaction. */
async function markSent(
  conn: Db,
  circle: CircleRow,
  share: { id: string; roundId: string },
  txHash: string,
  verified: boolean,
) {
  const now = new Date()
  await conn.transaction(async (tx) => {
    await tx
      .update(shares)
      .set({ txHash, sentAt: now, verifiedAt: verified ? now : null, checkedAt: now })
      .where(eq(shares.id, share.id))
    await advance(tx, circle, share.roundId)
  })
}

/**
 * Recompute a round's status from its shares, settle it when everything has
 * been confirmed, and move the circle on.
 *
 * §9 gives three statuses and this is where all three earn their meaning:
 *   open      at least one share has not been sent
 *   settling  every share is sent, the receiver has not signed them all off
 *   settled   every share confirmed by the receiver
 */
async function advance(tx: Tx, circle: CircleRow, roundId: string) {
  const round = await tx.query.rounds.findFirst({
    where: eq(rounds.id, roundId),
    with: { shares: true },
  })
  if (!round || round.status === 'settled') return

  // The member who is up never pays themselves, so their row is not a debt.
  const owed = round.shares.filter((x) => x.payerMemberId !== round.recipientMemberId)
  const allSent = owed.every((x) => x.sentAt !== null)
  const allConfirmed = owed.every((x) => x.confirmedAt !== null)

  if (!allConfirmed) {
    const next = allSent ? 'settling' : 'open'
    if (next !== round.status) {
      await tx.update(rounds).set({ status: next }).where(eq(rounds.id, round.id))
    }
    return
  }

  const settledAt = new Date()
  await tx.update(rounds).set({ status: 'settled', settledAt }).where(eq(rounds.id, round.id))

  const roster = await tx.query.members.findMany({
    where: eq(members.circleId, circle.id),
    orderBy: asc(members.position),
  })

  if (round.number >= circle.memberCount) {
    // Every member has received once. The circle closes (§8.8).
    await tx.update(circles).set({ status: 'closed' }).where(eq(circles.id, circle.id))
    return
  }

  await openRound(tx, circle, roster, round.number + 1, settledAt)
}

/** Load a share with everything needed to authorise acting on it. */
async function loadShare(conn: Db, code: string, shareId: string) {
  const circle = await conn.query.circles.findFirst({ where: eq(circles.code, normaliseCode(code)) })
  if (!circle) throw new HttpError(404, 'CODE_NOT_FOUND', 'No circle with that code.')

  const share = await conn.query.shares.findFirst({
    where: eq(shares.id, shareId),
    with: { round: true, payer: true },
  })
  if (!share || share.round.circleId !== circle.id) {
    throw new HttpError(404, 'SHARE_NOT_FOUND', 'No share to pay here.')
  }

  const recipient = await conn.query.members.findFirst({
    where: eq(members.id, share.round.recipientMemberId),
  })
  if (!recipient) throw new HttpError(500, 'ROTATION_BROKEN', 'This round has no recipient.')

  return { circle, share, recipient }
}

/**
 * The payer records the transaction hash (§9), after the wallet has returned
 * one. Nothing reaches this function on a cancelled send — the client never
 * calls it, because the SDK surfaces a cancellation instead of a hash. That is
 * what keeps a row from ever claiming a payment that did not happen.
 */
export async function recordSent(input: {
  code: string
  shareId: string
  txHash: string
  deviceId: string
}) {
  const conn = await db()
  const { circle, share, recipient } = await loadShare(conn, input.code, input.shareId)

  if (share.payer.deviceId !== input.deviceId) {
    throw new HttpError(403, 'NOT_YOUR_SHARE', 'Only the payer can record their own payment.')
  }
  if (share.round.status === 'settled') {
    throw new HttpError(409, 'ROUND_SETTLED', 'This round has already settled.')
  }
  if (share.confirmedAt) {
    throw new HttpError(409, 'ALREADY_PAID', 'This share is already settled.')
  }
  if (!/^[0-9a-fA-F]{64}$/.test(input.txHash)) {
    throw new HttpError(400, 'TX_HASH_MALFORMED', 'That is not a transaction hash.')
  }

  const txHash = input.txHash.toLowerCase()
  await assertHashUnused(conn, txHash, share.id)

  // Verified before the write, so a hash that does not pay this share is never
  // stored as verified. Not found is not a failed payment: the indexer is
  // usually a few seconds behind, so the share is recorded unverified and
  // looked up again on later reads.
  const check = await verifyTransfer({
    txHash,
    from: share.payer.address,
    to: recipient.address,
    amountLuna: share.amount,
    memo: paymentMemo(share.round.number, share.id),
  })

  await markSent(conn, circle, share, txHash, check.verified)

  const view = await readCircle(circle.code, input.deviceId)
  return { ...view, verification: check }
}

/**
 * The payer's app asks whether this share was already paid without Tanda
 * hearing of it (see `findPayment` in chain.ts). A payment found here matched
 * the share's memo, the recipient and the amount on chain, so it is recorded
 * as sent and verified. The receiver still confirms it, as with any other.
 */
export async function findSent(input: { code: string; shareId: string; deviceId: string }) {
  const conn = await db()
  const { circle, share, recipient } = await loadShare(conn, input.code, input.shareId)

  if (share.payer.deviceId !== input.deviceId) {
    throw new HttpError(403, 'NOT_YOUR_SHARE', 'Only the payer can look for their own payment.')
  }
  if (share.txHash || share.confirmedAt) {
    return { found: true as const, ...(await readCircle(circle.code, input.deviceId)) }
  }
  if (share.round.status === 'settled') {
    throw new HttpError(409, 'ROUND_SETTLED', 'This round has already settled.')
  }

  const result = await findPayment({
    to: recipient.address,
    amountLuna: share.amount,
    memo: paymentMemo(share.round.number, share.id),
  })
  if (!result.found) return { found: false as const, reason: result.reason }

  await assertHashUnused(conn, result.txHash, share.id)
  await markSent(conn, circle, share, result.txHash, true)
  return { found: true as const, ...(await readCircle(circle.code, input.deviceId)) }
}

/**
 * The receiver confirms the money arrived (§9). Only they can, and only for a
 * share the payer has already claimed to have sent — neither side can act for
 * the other, which is the whole mechanism.
 */
export async function confirmReceived(input: {
  code: string
  shareId: string
  deviceId: string
}) {
  const conn = await db()
  const { circle, share, recipient } = await loadShare(conn, input.code, input.shareId)

  if (recipient.deviceId !== input.deviceId) {
    throw new HttpError(403, 'NOT_THE_RECIPIENT', 'Only the member who is up can confirm a share.')
  }
  if (share.payerMemberId === recipient.id) {
    throw new HttpError(409, 'SELF_SHARE', 'Your own share settles when the round opens.')
  }
  if (!share.sentAt) {
    throw new HttpError(409, 'NOT_SENT_YET', 'That share has not been paid yet.')
  }
  if (share.confirmedAt) {
    throw new HttpError(409, 'ALREADY_CONFIRMED', 'You already confirmed this share.')
  }

  await conn.transaction(async (tx) => {
    await tx
      .update(shares)
      .set({ confirmedAt: new Date(), confirmedBy: recipient.id })
      .where(eq(shares.id, share.id))

    await advance(tx, circle, share.roundId)
  })

  return readCircle(circle.code, input.deviceId)
}

/**
 * Every circle this device holds a seat in, for the home screen (§8.2).
 * Circles still running come before closed ones, newest first within each.
 * One read per circle: a device belongs to a handful, not hundreds.
 */
export async function listCircles(deviceId: string) {
  const conn = await db()
  const seats = await conn.query.members.findMany({
    where: eq(members.deviceId, deviceId),
    with: { circle: true },
  })

  const views = await Promise.all(seats.map((seat) => readCircle(seat.circle.code, deviceId)))

  return views.sort((a, b) => {
    const closed = Number(a.circle.status === 'closed') - Number(b.circle.status === 'closed')
    if (closed !== 0) return closed
    return new Date(b.circle.createdAt).getTime() - new Date(a.circle.createdAt).getTime()
  })
}

export type CircleView = Awaited<ReturnType<typeof readCircle>>
