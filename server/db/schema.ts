/**
 * Tanda schema. Columns are exactly those named in docs/BRIEF.md §9 — the
 * brief's vocabulary rule (§0) applies to database columns, so no renaming.
 *
 * Money is stored in Luna (1 NIM = 100_000 Luna) as bigint. Never a float:
 * a share is a debt between two people and must compare exactly.
 */
import { relations } from 'drizzle-orm'
import {
  bigint,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const circleStatus = pgEnum('circle_status', ['forming', 'active', 'closed'])
export const roundStatus = pgEnum('round_status', ['open', 'settling', 'settled'])
export const frequency = pgEnum('frequency', ['weekly', 'monthly'])

export const circles = pgTable(
  'circles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    /** Luna, per member, per round. */
    shareAmount: bigint('share_amount', { mode: 'number' }).notNull(),
    currency: text('currency').notNull().default('NIM'),
    frequency: frequency('frequency').notNull(),
    memberCount: integer('member_count').notNull(),
    status: circleStatus('status').notNull().default('forming'),
    createdByDevice: text('created_by_device').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('circles_code_key').on(t.code)],
)

export const members = pgTable(
  'members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    circleId: uuid('circle_id')
      .notNull()
      .references(() => circles.id, { onDelete: 'cascade' }),
    /** 1-based seat in the rotation. Fixed at join, never drawn by lot (§2). */
    position: integer('position').notNull(),
    displayName: text('display_name').notNull(),
    address: text('address').notNull(),
    deviceId: text('device_id').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('members_circle_position_key').on(t.circleId, t.position),
    uniqueIndex('members_circle_device_key').on(t.circleId, t.deviceId),
    index('members_circle_idx').on(t.circleId),
  ],
)

export const rounds = pgTable(
  'rounds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    circleId: uuid('circle_id')
      .notNull()
      .references(() => circles.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    /** The member who is up. Derived from position, stored so it is auditable. */
    recipientMemberId: uuid('recipient_member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    opensAt: timestamp('opens_at', { withTimezone: true }).notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    status: roundStatus('status').notNull().default('open'),
    settledAt: timestamp('settled_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('rounds_circle_number_key').on(t.circleId, t.number),
    index('rounds_circle_idx').on(t.circleId),
  ],
)

export const shares = pgTable(
  'shares',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roundId: uuid('round_id')
      .notNull()
      .references(() => rounds.id, { onDelete: 'cascade' }),
    payerMemberId: uuid('payer_member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    /** Luna. Copied from the circle at round open so history stays truthful. */
    amount: bigint('amount', { mode: 'number' }).notNull(),
    /** Set by the payer. Null until they pay. */
    txHash: text('tx_hash'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    /** Set by the receiver. The two-sided mechanism: neither side can act for
     *  the other (§9). A share is settled only when both columns are present. */
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    confirmedBy: uuid('confirmed_by').references(() => members.id, { onDelete: 'set null' }),
    /**
     * ADDITION to the §9 column list. §3 told us to find out whether chain reads
     * were possible before designing, and §8.7 says to show `verified on chain`
     * next to any share the app could confirm itself — which needs somewhere to
     * record that. Set when the indexer confirms the hash really moved this
     * amount from this payer to this recipient. Never a substitute for
     * `confirmed_at`: the receiver still signs off, because the chain proves a
     * transfer happened, not that the circle agrees it counted.
     */
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('shares_round_payer_key').on(t.roundId, t.payerMemberId),
    index('shares_round_idx').on(t.roundId),
  ],
)

export const circlesRelations = relations(circles, ({ many }) => ({
  members: many(members),
  rounds: many(rounds),
}))

export const membersRelations = relations(members, ({ one, many }) => ({
  circle: one(circles, { fields: [members.circleId], references: [circles.id] }),
  shares: many(shares),
}))

export const roundsRelations = relations(rounds, ({ one, many }) => ({
  circle: one(circles, { fields: [rounds.circleId], references: [circles.id] }),
  recipient: one(members, { fields: [rounds.recipientMemberId], references: [members.id] }),
  shares: many(shares),
}))

export const sharesRelations = relations(shares, ({ one }) => ({
  round: one(rounds, { fields: [shares.roundId], references: [rounds.id] }),
  payer: one(members, { fields: [shares.payerMemberId], references: [members.id] }),
}))

export type Circle = typeof circles.$inferSelect
export type Member = typeof members.$inferSelect
export type Round = typeof rounds.$inferSelect
export type Share = typeof shares.$inferSelect
