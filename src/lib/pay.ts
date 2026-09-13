/**
 * Paying a share: the one place the wallet and our server meet.
 *
 * The ordering here is the whole safety property of §8.6.
 *
 *   0. an earlier attempt?     look on chain before the wallet opens again
 *   1. ask the wallet          it either hands back a hash or it does not
 *   2. stash the hash locally  survives a crash between 1 and 3
 *   3. tell the server         the only thing that marks a row as sent
 *   4. clear the stash
 *
 * The server is never told a hash the wallet did not return, so a cancelled
 * send cannot produce a row claiming a payment that did not happen. And the
 * hash is never only in flight, so a payment that DID happen cannot be lost
 * because a request failed.
 *
 * Step 0 covers what the wallet's answer cannot. In a three-phone test on
 * mainnet a payer paid one share twice, 17 seconds apart, because the app
 * never learned that the first payment went through. So each attempt is noted
 * on the device before the wallet opens, and until Tanda has a payment for the
 * share, the next tap looks for one on chain first.
 */
import { NimiqCallError, lunaToNim, nimToLuna, sendShare } from './nimiq'
import { api, clearUnreported, isRefusal, stashUnreported, type Verification } from './api'
import type { CircleView } from './api'

/**
 * What went wrong, as facts. No copy lives here: the UI words each of these in
 * the user's language (lib/i18n.tsx), so a failure is never an English string
 * leaking into a Spanish screen.
 */
export type PayFailure =
  /** The user backed out of the native dialog. Nothing moved. */
  | { kind: 'cancelled' }
  /** Not enough NIM. `shortfallNim` when it could be worked out exactly. */
  | { kind: 'insufficient'; shortfallNim: number | null }
  /**
   * The wallet refused for a reason we do not recognise, and no payment for
   * the share turned up on chain. `detail` is the wallet's own words, verbatim,
   * shown small under the message: on a real phone that is how an unrecognised
   * refusal gets named.
   */
  | { kind: 'wallet'; detail: string }
  /** Money DID move; we could not tell Tanda. The hash is stashed for replay. */
  | { kind: 'unreported'; txHash: string }
  /** The server refused the hash (already paid, round settled, ...). */
  | { kind: 'rejected'; code: string }

export type PayOutcome =
  /** `txHash` is null when the payment was found on chain rather than handed back by the wallet. */
  | { ok: true; txHash: string | null; circle: CircleView; verification: Verification }
  | { ok: false; failure: PayFailure }

/**
 * Map a wallet rejection onto the named states in §11.
 *
 * The SDK types the error arm as `{ type, message }` but does not enumerate the
 * `type` values, and they are not in the published reference. So this matches
 * defensively on both fields and, for anything unrecognised, shows the wallet's
 * own words rather than inventing a cause. Confirm the real strings on device
 * and tighten this.
 */
function classify(error: NimiqCallError): PayFailure {
  const haystack = `${error.type} ${error.message}`.toLowerCase()

  if (/insufficient|not enough|balance/.test(haystack)) {
    // "...short by 120.5 NIM": the wallet's own figure, if it gives one.
    const found = haystack.match(/(\d+(?:[.,]\d+)?)\s*nim/)
    return { kind: 'insufficient', shortfallNim: found ? Number(found[1].replace(',', '.')) : null }
  }

  if (/cancel|reject|denied|abort|dismiss|user/.test(haystack)) {
    return { kind: 'cancelled' }
  }

  return { kind: 'wallet', detail: walletDetail(error) }
}

/** The raw refusal, as close to verbatim as the error preserves it. */
function walletDetail(error: unknown): string {
  if (error instanceof NimiqCallError) return [error.type, error.message].filter(Boolean).join(' · ')
  if (error instanceof Error) return `${error.name}: ${error.message}`
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

/**
 * §11 wants the exact shortfall. The provider has no balance method, so ask
 * the indexer through our server and do the subtraction ourselves; fall back to
 * the wallet's figure, then to none. Never blocks: this only words a failure.
 */
async function exactShortfall(address: string, nim: number, walletFigure: number | null) {
  try {
    const { balance } = await api.balance(address)
    if (balance !== null) {
      const short = nimToLuna(nim) - balance
      if (short > 0) return lunaToNim(short)
    }
  } catch {
    // Indexer or server unreachable: use what the wallet said.
  }
  return walletFigure
}

/* ------------------------------------------------------------------------- *
 * Attempts: when the wallet last opened for a share, on this device.
 * ------------------------------------------------------------------------- */

const ATTEMPTS_KEY = 'tanda.attempts'
/** Past this, a payment that happened is long indexed, so one look settles it. */
const INDEXED_WITHIN_MS = 60_000
const ATTEMPT_TTL_MS = 24 * 60 * 60_000

/** `looked`: the chain was already searched after this attempt, for the full schedule. */
type Attempt = { at: number; looked: boolean }

function readAttempts(): Record<string, Attempt> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(ATTEMPTS_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, Attempt>) : {}
  } catch {
    return {}
  }
}

function writeAttempts(next: Record<string, Attempt>) {
  try {
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(next))
  } catch {
    // Storage refused. The lookup after an unreadable answer still runs.
  }
}

function attemptFor(shareId: string): Attempt | null {
  const attempt = readAttempts()[shareId]
  return typeof attempt?.at === 'number' && Date.now() - attempt.at < ATTEMPT_TTL_MS ? attempt : null
}

function markAttempt(shareId: string) {
  const now = Date.now()
  const kept = Object.entries(readAttempts()).filter(([, attempt]) => now - attempt.at < ATTEMPT_TTL_MS)
  writeAttempts({ ...Object.fromEntries(kept), [shareId]: { at: now, looked: false } })
}

function markLooked(shareId: string) {
  const attempts = readAttempts()
  const attempt = attempts[shareId]
  if (attempt) writeAttempts({ ...attempts, [shareId]: { ...attempt, looked: true } })
}

function clearAttempt(shareId: string) {
  writeAttempts(Object.fromEntries(Object.entries(readAttempts()).filter(([id]) => id !== shareId)))
}

/** Gaps between lookups after an unclear answer. The indexer trails the chain by seconds. */
const LOOKUP_GAPS_MS = [0, 3_000, 3_000, 4_000]

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Ask Tanda to look on chain for this share's payment. Null when none turned
 * up, or when Tanda could not be asked: the caller carries on as unpaid.
 */
async function lookForPayment(p: {
  code: string
  shareId: string
  deviceId: string
  gaps: number[]
}): Promise<PayOutcome | null> {
  for (const gap of p.gaps) {
    if (gap > 0) await pause(gap)
    try {
      const result = await api.findSent(p.code, p.shareId, p.deviceId)
      if (result.found) {
        clearAttempt(p.shareId)
        return { ok: true, txHash: null, circle: result, verification: { verified: true } }
      }
    } catch (error) {
      // Refused: the share settled or moved on, and the server knows.
      if (isRefusal(error)) return { ok: false, failure: { kind: 'rejected', code: error.code } }
      // Offline, or no session: there is nobody to ask.
      return null
    }
  }
  return null
}

export async function payShare(params: {
  code: string
  shareId: string
  recipient: string
  /** The payer's address in this circle, used only to word a short balance. */
  payerAddress: string
  /** The share's memo, as the server gives it. It is how the chain names the share. */
  memo: string
  nim: number
  deviceId: string
  /** The wallet has returned a hash and Tanda is being told. Recording can wait on the chain lookup. */
  onRecording?: () => void
  /** Tanda is looking on chain for a payment the app never heard back about. */
  onChecking?: () => void
  /** Gaps between chain lookups. Tests shorten them. */
  lookupGapsMs?: number[]
}): Promise<PayOutcome> {
  const { code, shareId, recipient, payerAddress, memo, nim, deviceId, onRecording, onChecking } = params
  const gaps = params.lookupGapsMs ?? LOOKUP_GAPS_MS

  // 0. The wallet opened for this share before and Tanda never heard back.
  //    The full schedule only while the indexer could still be catching up:
  //    once it has been searched after the attempt, or a minute has passed,
  //    one look settles it.
  const attempt = attemptFor(shareId)
  if (attempt !== null) {
    onChecking?.()
    const settled = attempt.looked || Date.now() - attempt.at >= INDEXED_WITHIN_MS
    const earlier = await lookForPayment({ code, shareId, deviceId, gaps: settled ? [0] : gaps })
    if (earlier) return earlier
  }

  // 1. The wallet. A cancellation arrives here as a thrown NimiqCallError: the
  //    SDK resolves its error arm rather than rejecting, and lib/nimiq.ts
  //    narrows it. Without that narrowing this branch would look like success.
  markAttempt(shareId)
  let txHash: string
  try {
    txHash = await sendShare({ recipient, nim, memo })
  } catch (error) {
    const failure: PayFailure =
      error instanceof NimiqCallError ? classify(error) : { kind: 'wallet', detail: walletDetail(error) }

    if (failure.kind === 'insufficient') {
      // Nothing to send it with.
      clearAttempt(shareId)
      failure.shortfallNim = await exactShortfall(payerAddress, nim, failure.shortfallNim)
    } else if (failure.kind === 'cancelled') {
      // The user said no in the wallet's own dialog, so the next tap goes straight back to it.
      clearAttempt(shareId)
    } else {
      // An answer the app cannot read. The wallet may have sent it anyway, so
      // look before saying it did not.
      onChecking?.()
      const found = await lookForPayment({ code, shareId, deviceId, gaps })
      if (found) return found
      markLooked(shareId)
    }
    return { ok: false, failure }
  }

  // 2. Money has moved. From here on, losing this hash is the expensive failure.
  //    The stash now guards against paying again, so the attempt can go.
  stashUnreported({ code, shareId, txHash })
  clearAttempt(shareId)
  onRecording?.()

  // 3. Tell Tanda.
  try {
    const { verification, ...circle } = await api.recordSent(code, shareId, txHash, deviceId)
    clearUnreported(shareId)
    return { ok: true, txHash, circle: circle as CircleView, verification }
  } catch (error) {
    if (isRefusal(error)) {
      // The server actively refused it. Replaying will not help.
      clearUnreported(shareId)
      return { ok: false, failure: { kind: 'rejected', code: error.code } }
    }
    return { ok: false, failure: { kind: 'unreported', txHash } }
  }
}
