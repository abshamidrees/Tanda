/**
 * Paying a share: the one place the wallet and our server meet.
 *
 * The ordering here is the whole safety property of §8.6.
 *
 *   1. ask the wallet          — it either hands back a hash or it does not
 *   2. stash the hash locally  — survives a crash between 1 and 3
 *   3. tell the server         — the only thing that marks a row as sent
 *   4. clear the stash
 *
 * The server is never told anything before step 1 returns a hash, so a
 * cancelled send cannot produce a row claiming a payment that did not happen.
 * And the hash is never only in flight, so a payment that DID happen cannot be
 * lost because a request failed.
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
   * The wallet refused for a reason we do not recognise. Nothing moved.
   * `detail` is the wallet's own words, verbatim, shown small under the
   * message: on a real phone that is how an unrecognised refusal gets named.
   */
  | { kind: 'wallet'; detail: string }
  /** Money DID move; we could not tell Tanda. The hash is stashed for replay. */
  | { kind: 'unreported'; txHash: string }
  /** The server refused the hash (already paid, round settled, ...). */
  | { kind: 'rejected'; code: string }

export type PayOutcome =
  | { ok: true; txHash: string; circle: CircleView; verification: Verification }
  | { ok: false; failure: PayFailure }

/**
 * Map a wallet rejection onto the named states in §11.
 *
 * The SDK types the error arm as `{ type, message }` but does not enumerate the
 * `type` values, and they are not in the published reference — so this matches
 * defensively on both fields and, for anything unrecognised, shows the wallet's
 * own words rather than inventing a cause. Confirm the real strings on device
 * and tighten this.
 */
function classify(error: NimiqCallError): PayFailure {
  const haystack = `${error.type} ${error.message}`.toLowerCase()

  if (/insufficient|not enough|balance/.test(haystack)) {
    // "...short by 120.5 NIM" — the wallet's own figure, if it gives one.
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

export async function payShare(params: {
  code: string
  shareId: string
  recipient: string
  /** The payer's address in this circle, used only to word a short balance. */
  payerAddress: string
  /** The wallet has returned a hash and Tanda is being told. Recording can wait on the chain lookup. */
  onRecording?: () => void
  nim: number
  roundNumber: number
  deviceId: string
}): Promise<PayOutcome> {
  const { code, shareId, recipient, payerAddress, nim, roundNumber, deviceId, onRecording } = params

  // 1. The wallet. A cancellation arrives here as a thrown NimiqCallError —
  //    the SDK resolves its error arm rather than rejecting, and lib/nimiq.ts
  //    narrows it. Without that narrowing this branch would look like success.
  let txHash: string
  try {
    txHash = await sendShare({
      recipient,
      nim,
      memo: `tanda ${code} r${roundNumber}`,
    })
  } catch (error) {
    if (!(error instanceof NimiqCallError)) {
      return { ok: false, failure: { kind: 'wallet', detail: walletDetail(error) } }
    }
    const failure = classify(error)
    if (failure.kind === 'insufficient') {
      failure.shortfallNim = await exactShortfall(payerAddress, nim, failure.shortfallNim)
    }
    return { ok: false, failure }
  }

  // 2. Money has moved. From here on, losing this hash is the expensive failure.
  stashUnreported({ code, shareId, txHash })
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
