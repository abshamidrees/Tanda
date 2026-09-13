/**
 * Circle rules. Pure functions, no database — so the rotation is testable and
 * the API layer stays thin.
 */
import { randomInt } from 'node:crypto'

export const LUNA_PER_NIM = 100_000
export const nimToLuna = (nim: number) => Math.round(nim * LUNA_PER_NIM)
export const lunaToNim = (luna: number) => luna / LUNA_PER_NIM

export const MIN_MEMBERS = 3
export const MAX_MEMBERS = 12

/** No 0/O/1/I/L/U. Codes get read aloud and retyped from a WhatsApp message. */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'
export const CODE_LENGTH = 6

export function generateCode(): string {
  let out = ''
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return out
}

export function normaliseCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^0-9A-Z]/g, '')
}

export function isValidCode(raw: string): boolean {
  const code = normaliseCode(raw)
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c))
}

/**
 * The memo a share's payment carries, e.g. `tanda r2 3f9a1c2b`: the round, and
 * the start of the share's own random id. It names one share and nothing else.
 *
 * The circle code stays off the chain. Memos are public, and a code is what
 * lets someone look a circle up.
 */
export function paymentMemo(roundNumber: number, shareId: string): string {
  return `tanda r${roundNumber} ${shareId.replace(/-/g, '').slice(0, 8).toLowerCase()}`
}

/**
 * The pot is every member's share for the round.
 *
 * NOTE — the brief states this three times (§0, §8.3): pot = members × share,
 * so six members at 500 NIM make a 3,000 NIM pot and each member pays
 * 6 × 500 = 3,000 across the circle. But §8.5 says the member who is up sees
 * what they will receive instead of a Pay button, and §8.5 lists a `not due`
 * chip. Both hold only if the member who is up still owes a share but never
 * pays it to themselves. So: every member gets a share row each round, and the
 * recipient's own share is settled automatically at round open. No
 * self-transaction ever reaches the wallet, and the arithmetic stays exact.
 */
export function potLuna(memberCount: number, shareAmountLuna: number): number {
  return memberCount * shareAmountLuna
}

/** Deterministic. Round n is taken by the member at position n. Never by lot (§2). */
export function recipientPositionForRound(roundNumber: number, memberCount: number): number {
  return ((roundNumber - 1) % memberCount) + 1
}

export function addPeriod(from: Date, freq: 'weekly' | 'monthly'): Date {
  const d = new Date(from)
  if (freq === 'weekly') d.setUTCDate(d.getUTCDate() + 7)
  else d.setUTCMonth(d.getUTCMonth() + 1)
  return d
}

export type ShareState = 'paid' | 'sent' | 'outstanding' | 'not due'

/** The three chips in §8.5, plus the intermediate state §8.6 needs. */
export function shareState(share: {
  sentAt: Date | null
  confirmedAt: Date | null
  isRecipient: boolean
}): ShareState {
  if (share.isRecipient) return 'not due'
  if (share.confirmedAt) return 'paid'
  if (share.sentAt) return 'sent'
  return 'outstanding'
}
