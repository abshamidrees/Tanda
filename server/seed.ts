/**
 * Seeds one circle so the screens in §8 have real data to render.
 *
 * Six members, 500 NIM weekly, rounds 1 and 2 settled, round 3 open and due in
 * two days. Round 3 deliberately carries all four member states so every chip
 * in §8.5 has something to draw:
 *
 *   position 1  Amara     paid         (sent + confirmed)
 *   position 2  Beatriz   paid
 *   position 3  Chidi     not due      (is up this round)
 *   position 4  Daniela   paid
 *   position 5  Esi       sent         (hash recorded, receiver has not confirmed)
 *   position 6  Farhan    outstanding
 *
 * Two shares are unconfirmed, so the circle reads "Waiting on 2 members".
 *
 * Run: npm run seed
 *
 * PGlite keeps the database in the process that opened it, so a running dev
 * server will not see a re-seed. Stop it, seed, start it again.
 */
import { eq } from 'drizzle-orm'
import { migrateToLatest, db, schema } from './db/client.js'
import { addPeriod, nimToLuna } from './domain.js'

const { circles, members, rounds, shares } = schema

/** Position 1's device. Point the client at this to browse as Amara in dev. */
export const SEED_DEVICE = 'a'.repeat(64)

const CODE = 'K7MPQ4'

const ROSTER = [
  { displayName: 'Amara', address: 'NQ34 8CKS L5PQ 7XGD 2VRE 9MHT 4JAB 6NUY 3QDF', deviceId: SEED_DEVICE },
  { displayName: 'Beatriz', address: 'NQ71 2MQD 8VXT 5KRH 9JGP 3NCE 7BSL 4YUA 6FDX', deviceId: 'b'.repeat(64) },
  { displayName: 'Chidi', address: 'NQ09 6TRK 3PDN 8QHV 5XGA 2MCJ 9FEU 7LBS 4YNP', deviceId: 'c'.repeat(64) },
  { displayName: 'Daniela', address: 'NQ52 9HFB 4LSX 6NUD 3KPT 7QGR 2VYM 5EJA 8CDN', deviceId: 'd'.repeat(64) },
  { displayName: 'Esi', address: 'NQ18 5GQN 7YJD 2BHL 8SCV 4XRP 6TAF 9MKE 3UDY', deviceId: 'e'.repeat(64) },
  { displayName: 'Farhan', address: 'NQ63 4DVP 9MXH 3RCU 7LFT 5NBK 8QAG 2YSJ 6EDX', deviceId: 'f'.repeat(64) },
]

const hash = (n: number) => n.toString(16).padStart(2, '0').repeat(32)

const days = (n: number) => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + n)
  d.setUTCMilliseconds(0)
  return d
}

async function main() {
  const kind = await migrateToLatest()
  const conn = await db()

  // Idempotent: drop the seeded circle, cascades to members, rounds and shares.
  await conn.delete(circles).where(eq(circles.code, CODE))

  const shareAmount = nimToLuna(500)

  const [circle] = await conn
    .insert(circles)
    .values({
      code: CODE,
      name: 'Sunday Six',
      shareAmount,
      currency: 'NIM',
      frequency: 'weekly',
      memberCount: 6,
      status: 'active',
      createdByDevice: SEED_DEVICE,
      createdAt: days(-21),
    })
    .returning()

  const roster = await conn
    .insert(members)
    .values(
      ROSTER.map((m, i) => ({
        circleId: circle.id,
        position: i + 1,
        displayName: m.displayName,
        address: m.address,
        deviceId: m.deviceId,
        joinedAt: days(-21 + i),
      })),
    )
    .returning()

  const at = (position: number) => roster.find((m) => m.position === position)!

  /** One round plus its six share rows. `paid` lists positions that confirmed. */
  async function seedRound(opts: {
    number: number
    opensAt: Date
    settled: boolean
    paid: number[]
    sent?: number[]
  }) {
    const recipient = at(opts.number)
    const opensAt = opts.opensAt
    const dueAt = addPeriod(opensAt, 'weekly')

    const [round] = await conn
      .insert(rounds)
      .values({
        circleId: circle.id,
        number: opts.number,
        recipientMemberId: recipient.id,
        opensAt,
        dueAt,
        status: opts.settled ? 'settled' : 'open',
        settledAt: opts.settled ? dueAt : null,
      })
      .returning()

    // A payment lands partway through the round; confirmation follows it.
    const paidAt = new Date(opensAt.getTime() + 36 * 3600 * 1000)
    const okAt = new Date(opensAt.getTime() + 40 * 3600 * 1000)

    await conn.insert(shares).values(
      roster.map((m) => {
        // The member who is up never pays themselves; their share settles on open.
        if (m.id === recipient.id) {
          return {
            roundId: round.id,
            payerMemberId: m.id,
            amount: shareAmount,
            sentAt: opensAt,
            confirmedAt: opensAt,
            confirmedBy: recipient.id,
          }
        }
        if (opts.paid.includes(m.position)) {
          return {
            roundId: round.id,
            payerMemberId: m.id,
            amount: shareAmount,
            txHash: hash(opts.number * 16 + m.position),
            sentAt: paidAt,
            confirmedAt: okAt,
            confirmedBy: recipient.id,
          }
        }
        if (opts.sent?.includes(m.position)) {
          return {
            roundId: round.id,
            payerMemberId: m.id,
            amount: shareAmount,
            txHash: hash(opts.number * 16 + m.position),
            sentAt: paidAt,
          }
        }
        return { roundId: round.id, payerMemberId: m.id, amount: shareAmount }
      }),
    )
  }

  // Rounds 1 and 2 are settled: everyone who owed a share paid and was confirmed.
  await seedRound({ number: 1, opensAt: days(-19), settled: true, paid: [2, 3, 4, 5, 6] })
  await seedRound({ number: 2, opensAt: days(-12), settled: true, paid: [1, 3, 4, 5, 6] })
  // Round 3 is live. Chidi is up. Two shares are still unconfirmed.
  await seedRound({ number: 3, opensAt: days(-5), settled: false, paid: [1, 2, 4], sent: [5] })

  console.log(`seeded via ${kind}`)
  console.log(`  circle  ${circle.name} (${CODE}), 500 NIM weekly, 6 members`)
  console.log(`  rounds  1 and 2 settled, 3 open and due ${days(2).toISOString().slice(0, 10)}`)
  console.log(`  device  ${SEED_DEVICE.slice(0, 12)}… browses as ${ROSTER[0].displayName}`)
  console.log(`  read    GET /api/circles/${CODE}`)
  console.log('  note    restart the dev server if it was running; it holds its own copy')
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error)
    process.exit(1)
  },
)
