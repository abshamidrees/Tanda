/**
 * The ONLY file in Tanda that imports @nimiq/mini-app-sdk.
 *
 * Everything below is shaped by what the SDK actually does, verified against
 * @nimiq/mini-app-sdk@0.1.0 rather than assumed:
 *
 *  - init() REJECTS (it does not hang and does not resolve null) when the
 *    provider is absent. It polls window.nimiq every 50ms and rejects at the
 *    timeout with "Nimiq provider was not injected."  Measured: 303ms for a
 *    300ms timeout; 465ms when the provider appeared at 400ms. Late injection
 *    is therefore tolerated, which is why we never feature-detect on load.
 *
 *  - Every provider method is typed `Promise<T | ErrorResponse>`. The published
 *    docs say `Promise<string>`; the shipped .d.ts disagrees. We trust the
 *    .d.ts and narrow every call through unwrap().
 *
 *  - There is NO transaction-history method on the provider. Chain verification
 *    does not live here. See lib/api.ts.
 */

import {
  init,
  getHostLanguage,
  requestDeviceIdentifier,
  type NimiqProvider,
  type ErrorResponse,
} from '@nimiq/mini-app-sdk'

/** 1 NIM = 100_000 Luna. Every provider amount is Luna, integer. */
export const LUNA_PER_NIM = 100_000

export const nimToLuna = (nim: number): number => Math.round(nim * LUNA_PER_NIM)
export const lunaToNim = (luna: number): number => luna / LUNA_PER_NIM

/** A Nimiq address as the provider returns it: "NQ07 0000 ...". */
export type NimiqAddress = string

/** Transaction hash returned by every send* method. */
export type TxHash = string

export type ProviderState =
  | { status: 'ready'; provider: NimiqProvider }
  | { status: 'absent'; reason: string }

/**
 * The SDK's ErrorResponse is a plain object with an `error` key, returned in
 * the RESOLVE path — not thrown. Any call that forgets to narrow will happily
 * treat `{error:{...}}` as a tx hash, so nothing calls the provider directly.
 *
 * Any `error` key counts, whatever is inside it. The .d.ts promises
 * `{ type, message }` strings, but a host that sends a bare string or a code
 * must still land on a failure, never on a hash.
 */
function isErrorResponse(value: unknown): value is { error: unknown } {
  return typeof value === 'object' && value !== null && 'error' in value
}

/** Stringify anything a host might hand back, for a failure the user can read out. */
function verbatim(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

function errorFields(error: unknown): { type: string; message: string } {
  const { type, message } = (typeof error === 'object' && error !== null ? error : {}) as Partial<ErrorResponse['error']>
  return {
    type: typeof type === 'string' ? type : '',
    message: typeof message === 'string' ? message : verbatim(error),
  }
}

export class NimiqCallError extends Error {
  readonly method: string
  readonly type: string

  constructor(method: string, type: string, message: string) {
    super(`${method}: ${message}`)
    this.name = 'NimiqCallError'
    this.method = method
    this.type = type
  }
}

/** Collapse the `T | ErrorResponse` union into `T`, throwing on the error arm. */
async function unwrap<T>(method: string, call: Promise<T | ErrorResponse>): Promise<T> {
  const result = await call
  if (isErrorResponse(result)) {
    const { type, message } = errorFields(result.error)
    throw new NimiqCallError(method, type, message)
  }
  return result as T
}

let pending: Promise<ProviderState> | null = null

/**
 * Connect to the host provider. Never throws: callers get a discriminated
 * state so the desktop fallback card and the in-Pay app share one code path.
 * Memoised — repeated calls reuse the first attempt.
 */
export function connect(timeout = 10_000): Promise<ProviderState> {
  pending ??= init({ timeout }).then(
    (provider): ProviderState => ({ status: 'ready', provider }),
    (error: unknown): ProviderState => ({
      status: 'absent',
      reason: error instanceof Error ? error.message : String(error),
    }),
  )
  return pending
}

/**
 * A fresh attempt, discarding the memoised one. §11's "retry" means exactly
 * this: ask the host again rather than re-read a result that already failed.
 */
export function reconnect(timeout?: number): Promise<ProviderState> {
  pending = null
  return connect(timeout)
}

/**
 * Nimiq Pay seeds `window.nimiqPay` before any page script runs, so this is a
 * synchronous answer to "are we inside Nimiq Pay" — no ten-second wait on
 * init() to find out a desktop visitor is on a desktop.
 */
export function isInsideNimiqPay(): boolean {
  return typeof window !== 'undefined' && window.nimiqPay !== undefined
}

/** Resolve the provider or throw. For call sites that already know we are in Pay. */
async function provider(): Promise<NimiqProvider> {
  const state = await connect()
  if (state.status === 'absent') throw new Error(state.reason)
  return state.provider
}

/** Prompts the user. Returns every address they approve, first one is primary. */
export async function listAccounts(): Promise<NimiqAddress[]> {
  return unwrap('listAccounts', (await provider()).listAccounts())
}

export async function getBlockNumber(): Promise<number> {
  return (await provider()).getBlockNumber()
}

export async function isConsensusEstablished(): Promise<boolean> {
  return (await provider()).isConsensusEstablished()
}

/**
 * Pay one share, wallet to wallet. Tanda never touches the funds; this opens
 * Nimiq Pay's native send dialog and returns once the user approves.
 *
 * `memo` rides along as transaction data so the payment is self-describing on
 * chain. Omit it and this degrades to sendBasicTransaction.
 *
 * @param nim  amount in NIM (converted to Luna here, the only place we convert)
 */
export async function sendShare(params: {
  recipient: NimiqAddress
  nim: number
  memo?: string
  fee?: number
  validityStartHeight?: number
}): Promise<TxHash> {
  const p = await provider()
  const { recipient, nim, memo, fee, validityStartHeight } = params
  const value = nimToLuna(nim)

  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`share must be a positive amount, got ${nim} NIM`)
  }

  const method = memo ? 'sendBasicTransactionWithData' : 'sendBasicTransaction'
  const result = await unwrap(
    method,
    memo
      ? p.sendBasicTransactionWithData({ recipient, value, data: memo, fee, validityStartHeight })
      : p.sendBasicTransaction({ recipient, value, fee, validityStartHeight }),
  )

  // Only a non-empty string can be a transaction. Anything else (a host that
  // resolves null on dismiss, say) is a failure, so no row claims a payment.
  if (typeof result !== 'string' || result.trim() === '') {
    throw new NimiqCallError(method, 'UNEXPECTED_RESULT', verbatim(result))
  }
  return result
}

/** ISO 639-1 code from Nimiq Pay, seeded before page scripts run. */
export function hostLanguage(): string | undefined {
  return getHostLanguage()
}

/** Pseudonymous, per-origin, per-device id. Prompts once per origin. */
export function deviceId(reason: string): Promise<string> {
  return requestDeviceIdentifier({ reason })
}

/** Diagnostics for the day-one probe screen. Never throws. */
export async function probe() {
  const started = performance.now()
  const state = await connect()
  const elapsed = Math.round(performance.now() - started)

  if (state.status === 'absent') {
    return { ok: false as const, elapsed, reason: state.reason, language: getHostLanguage() }
  }

  const settled = await Promise.allSettled([
    state.provider.isConsensusEstablished(),
    state.provider.getBlockNumber(),
  ])
  const [consensus, height] = settled

  return {
    ok: true as const,
    elapsed,
    language: getHostLanguage(),
    network: state.provider.getNetwork(),
    consensus: consensus.status === 'fulfilled' ? consensus.value : consensus.reason?.message,
    height: height.status === 'fulfilled' ? height.value : height.reason?.message,
    /** undefined means the host injected no RPC URL, so provider.request() to
     *  any non-wallet method will throw. This is the on-device answer to
     *  "can the mini app read history through the provider". */
    rpc: state.provider.getRPC() === undefined ? null : 'configured',
    methods: Object.getOwnPropertyNames(Object.getPrototypeOf(state.provider))
      .filter((k) => k !== 'constructor')
      .sort(),
  }
}

/* ------------------------------------------------------------------------- *
 * Phone test only (app/PhoneTest.tsx, opened with ?probe).
 *
 * These call the provider WITHOUT unwrap() and report exactly what came back,
 * resolve or reject, so the real shape of a cancel, a success and a refusal can
 * be read off a device instead of guessed. Never use them in product code: they
 * deliberately skip the narrowing that stops a cancelled payment reading as sent.
 * ------------------------------------------------------------------------- */

export type RawCall =
  | { method: 'listAccounts' }
  | { method: 'sendBasicTransaction'; recipient: string; value: number }
  | { method: 'sendBasicTransactionWithData'; recipient: string; value: number; data: string }
  | { method: 'request:getBlockNumber' }

export type RawOutcome =
  | { settled: 'no-provider'; ms: number; reason: string }
  | { settled: 'resolved'; ms: number; value: unknown }
  | { settled: 'rejected'; ms: number; error: unknown }

export async function rawCall(call: RawCall): Promise<RawOutcome> {
  const started = performance.now()
  const ms = () => Math.round(performance.now() - started)
  const state = await connect()
  if (state.status === 'absent') return { settled: 'no-provider', ms: ms(), reason: state.reason }

  const provider = state.provider
  try {
    const value =
      call.method === 'listAccounts'
        ? await provider.listAccounts()
        : call.method === 'sendBasicTransaction'
          ? await provider.sendBasicTransaction({ recipient: call.recipient, value: call.value })
          : call.method === 'sendBasicTransactionWithData'
            ? await provider.sendBasicTransactionWithData({
                recipient: call.recipient,
                value: call.value,
                data: call.data,
              })
            : await provider.request({ method: 'getBlockNumber' })
    return { settled: 'resolved', ms: ms(), value }
  } catch (error) {
    return { settled: 'rejected', ms: ms(), error }
  }
}

/** What the host injected, read without calling anything that prompts. */
export async function hostReport() {
  const started = performance.now()
  const state = await reconnect(60_000)
  const initMs = Math.round(performance.now() - started)
  if (state.status === 'absent') {
    return { init: 'rejected', initMs, reason: state.reason, language: getHostLanguage() ?? null }
  }
  const provider = state.provider
  const settle = async <T,>(fn: () => Promise<T>) => {
    try {
      return { resolved: await fn() }
    } catch (error) {
      return { rejected: error instanceof Error ? error.message : String(error) }
    }
  }
  const rpc = provider.getRPC()
  return {
    init: 'resolved',
    initMs,
    language: getHostLanguage() ?? null,
    network: provider.getNetwork(),
    consensus: await settle(() => provider.isConsensusEstablished()),
    blockNumber: await settle(() => provider.getBlockNumber()),
    rpcInjected: rpc !== undefined,
    rpc: rpc === undefined ? null : Object.prototype.toString.call(rpc),
    hostContextKeys: window.nimiqPay ? Object.keys(window.nimiqPay) : null,
  }
}
