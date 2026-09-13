/**
 * Typed client for Tanda's own server. Knows nothing about wallets — that is
 * lib/nimiq.ts. The two meet in lib/pay.ts.
 */
import { isSessionOpen } from './session'

export type ShareState = 'paid' | 'sent' | 'outstanding' | 'not due'
export type RoundStatus = 'open' | 'settling' | 'settled'
export type CircleStatus = 'forming' | 'active' | 'closed'

export interface MemberBrief {
  id: string
  position: number
  displayName: string
  address: string
}

export interface MemberRow extends MemberBrief {
  isYou: boolean
  isUp: boolean
  shareId: string | null
  txHash: string | null
  verifiedAt: string | null
  state: ShareState
}

export interface ShareRow {
  id: string
  payer: MemberBrief | null
  amount: number
  amountNim: number
  txHash: string | null
  /** What this share's payment memo must say, so the chain can name the share. */
  memo: string
  sentAt: string | null
  confirmedAt: string | null
  verifiedAt: string | null
  isMine: boolean
  state: ShareState
}

export interface CircleView {
  circle: {
    id: string
    code: string
    name: string
    shareAmount: number
    shareNim: number
    currency: string
    frequency: 'weekly' | 'monthly'
    memberCount: number
    status: CircleStatus
    createdAt: string
    pot: number
    potNim: number
    totalRounds: number
    seatsRemaining: number
  }
  you: {
    memberId: string
    position: number
    displayName: string
    address: string
    /** Luna and NIM, from confirmed records, split the way the wallet saw it (§8.8). */
    totals: {
      sent: number
      sentNim: number
      ownShare: number
      ownShareNim: number
      contributed: number
      contributedNim: number
      received: number
      receivedNim: number
    }
  } | null
  members: MemberRow[]
  round: {
    id: string
    number: number
    totalRounds: number
    status: RoundStatus
    opensAt: string
    dueAt: string
    recipient: MemberBrief | null
    youAreUp: boolean
    pot: number
    potNim: number
    outstanding: number
    shares: ShareRow[]
  } | null
  history: {
    number: number
    recipient: MemberBrief | null
    pot: number
    potNim: number
    settledAt: string | null
  }[]
}

export interface Verification {
  verified: boolean
  reason?: 'not_found' | 'mismatch' | 'not_executed' | 'unreachable'
  confirmations?: number
}

/** A named server failure (§11). `offline` means we never reached Tanda. */
export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly details: Record<string, unknown>

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }

  /** We never reached Tanda. Distinct from NO_SESSION, which never tried. */
  get offline() {
    return this.code === 'OFFLINE'
  }
}

/**
 * Tanda received the request and refused it (4xx): replaying will not help.
 * Offline, no session and 5xx are not refusals — a stashed hash must survive them.
 */
export function isRefusal(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status >= 400 && error.status < 500
}

async function request<T>(path: string, init: RequestInit & { deviceId?: string } = {}): Promise<T> {
  // Before the wallet gate resolves there is no identity to act for, and
  // outside Nimiq Pay there never will be. Nothing leaves the device.
  if (!isSessionOpen()) {
    throw new ApiError(0, 'NO_SESSION', 'No wallet session.')
  }

  const { deviceId, ...rest } = init

  let response: Response
  try {
    response = await fetch(path, {
      ...rest,
      headers: {
        ...(rest.body ? { 'content-type': 'application/json' } : {}),
        ...(deviceId ? { 'x-tanda-device': deviceId } : {}),
        ...rest.headers,
      },
    })
  } catch {
    // §11: never a thrown error the user sees raw.
    throw new ApiError(0, 'OFFLINE', 'Could not reach Tanda.')
  }

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const error = body?.error
    throw new ApiError(
      response.status,
      error?.code ?? 'UNKNOWN',
      error?.message ?? 'Something went wrong.',
      error?.details ?? {},
    )
  }
  return body as T
}

export const api = {
  /** Luna, or null when the indexer is unreachable. */
  balance: (address: string) =>
    request<{ balance: number | null }>(`/api/balance?address=${encodeURIComponent(address)}`),

  createCircle: (
    input: {
      name: string
      shareNim: number
      frequency: 'weekly' | 'monthly'
      memberCount: number
      displayName: string
      address: string
    },
    deviceId: string,
  ) => request<CircleView>('/api/circles', { method: 'POST', body: JSON.stringify(input), deviceId }),

  /** §8.4. Joining takes the next seat; the last seat starts the circle. */
  joinCircle: (code: string, input: { displayName: string; address: string }, deviceId: string) =>
    request<CircleView>(`/api/circles/${encodeURIComponent(code)}/join`, {
      method: 'POST',
      body: JSON.stringify(input),
      deviceId,
    }),

  /** Every circle this device holds a seat in (§8.2). */
  listCircles: (deviceId: string) => request<CircleView[]>('/api/circles', { deviceId }),

  readCircle: (code: string, deviceId?: string) =>
    request<CircleView>(`/api/circles/${encodeURIComponent(code)}`, { deviceId }),

  /** Called only after the wallet has handed back a real hash. */
  recordSent: (code: string, shareId: string, txHash: string, deviceId: string) =>
    request<CircleView & { verification: Verification }>(
      `/api/circles/${encodeURIComponent(code)}/shares/${shareId}/sent`,
      { method: 'POST', body: JSON.stringify({ txHash }), deviceId },
    ),

  /**
   * Was this share already paid without Tanda hearing of it? Looks on chain
   * for its memo. Found means the server has now recorded it.
   */
  findSent: (code: string, shareId: string, deviceId: string) =>
    request<({ found: true } & CircleView) | { found: false; reason: 'not_found' | 'unreachable' }>(
      `/api/circles/${encodeURIComponent(code)}/shares/${shareId}/find`,
      { method: 'POST', deviceId },
    ),

  confirmReceived: (code: string, shareId: string, deviceId: string) =>
    request<CircleView>(`/api/circles/${encodeURIComponent(code)}/shares/${shareId}/confirm`, {
      method: 'POST',
      deviceId,
    }),
}

/* ------------------------------------------------------------------------- *
 * Unreported payments
 *
 * There is a window between the wallet returning a hash and our server
 * accepting it. If the request fails in that window the money has moved and
 * Tanda does not know — the mirror image of the failure §8.6 warns about, and
 * the more expensive one, because the payer cannot prove what they did.
 *
 * So the hash is written to this device before the server is told, and replayed
 * on next load. It is cleared only once the server has it.
 * ------------------------------------------------------------------------- */

const STASH_KEY = 'tanda.unreported'

export interface Unreported {
  code: string
  shareId: string
  txHash: string
  at: number
}

function readStash(): Unreported[] {
  try {
    const raw = localStorage.getItem(STASH_KEY)
    return raw ? (JSON.parse(raw) as Unreported[]) : []
  } catch {
    return []
  }
}

function writeStash(entries: Unreported[]) {
  try {
    localStorage.setItem(STASH_KEY, JSON.stringify(entries))
  } catch {
    // Private mode, or storage disabled. The in-flight request still runs; we
    // simply lose the ability to replay it. Better than failing the payment.
  }
}

export function stashUnreported(entry: Omit<Unreported, 'at'>) {
  const entries = readStash().filter((e) => e.shareId !== entry.shareId)
  writeStash([...entries, { ...entry, at: Date.now() }])
}

export function clearUnreported(shareId: string) {
  writeStash(readStash().filter((e) => e.shareId !== shareId))
}

export function unreportedFor(code: string): Unreported[] {
  return readStash().filter((e) => e.code === code)
}

/** Replay anything the server never acknowledged. Safe to call repeatedly. */
export async function flushUnreported(code: string, deviceId: string): Promise<number> {
  let sent = 0
  for (const entry of unreportedFor(code)) {
    try {
      await api.recordSent(entry.code, entry.shareId, entry.txHash, deviceId)
      clearUnreported(entry.shareId)
      sent++
    } catch (error) {
      // Already recorded, or the round moved on: the server knows, so drop it.
      if (isRefusal(error)) clearUnreported(entry.shareId)
    }
  }
  return sent
}
