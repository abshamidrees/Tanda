/**
 * Chain verification.
 *
 * The Nimiq provider has no transaction-history method, established in
 * docs/DAY-ONE.md against the shipped SDK and the official reference. So
 * verification runs here, server-side, against a public indexer. Doing it on
 * the server rather than in the WebView keeps it from being a claim the client
 * makes about itself, and keeps the indexer swappable.
 *
 * This is an upgrade on top of the two-sided mechanism in §9, never a
 * replacement. The chain proves a transfer happened. It cannot prove the circle
 * agreed it counted, so the receiver still signs off.
 */

const INDEXER = 'https://api.nimiqwatch.com/api/v1'
const TIMEOUT_MS = 6_000

/** The indexer's transaction shape. Only the fields we actually check. */
interface IndexedTx {
  hash: string
  sender_address: string
  receiver_address: string
  value: number
  executed: boolean
  confirmations: number
  timestamp: number
  /** The memo, hex. Nimiq Pay writes the UTF-8 bytes of the text it was handed. */
  data?: string | null
}

export type VerifyResult =
  | { verified: true; confirmations: number }
  | { verified: false; reason: 'not_found' | 'mismatch' | 'not_executed' | 'unreachable' }

/** Addresses compare without spacing or case. The indexer returns them spaced. */
const canonical = (address: string) => address.replace(/\s+/g, '').toUpperCase()

/** The indexer wants dashes where addresses usually carry spaces. */
const slug = (address: string) => address.trim().toUpperCase().replace(/\s+/g, '-')

/** A memo as the indexer returns it, hex, back to the text the payer's app wrote. */
export function decodeMemo(hex: string | null | undefined): string {
  if (!hex || !/^(?:[0-9a-fA-F]{2})+$/.test(hex)) return ''
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return new TextDecoder().decode(bytes)
}

/**
 * Does this transaction pay this share?
 *
 * The recipient and the amount must always match. Then either the memo names
 * the share, or the sender is the address the payer joined with. The memo is
 * the rule because of a three-phone test on mainnet: all seven payments came
 * from a different account than the one each payer joined with, since Nimiq
 * Pay sends from whichever account is active. The sender still counts for a
 * payment that carries no memo of ours.
 */
function paysShare(tx: IndexedTx, share: { from: string; to: string; amountLuna: number; memo: string }) {
  if (canonical(tx.receiver_address ?? '') !== canonical(share.to)) return false
  // Overpaying a share is still paying it. Underpaying is not.
  if (!(tx.value >= share.amountLuna)) return false
  return decodeMemo(tx.data) === share.memo || canonical(tx.sender_address ?? '') === canonical(share.from)
}

/**
 * Does this hash really pay this share?
 *
 * A hash that exists but pays the wrong person, the right person too little,
 * or a different share is not verification. It is the most obvious way to fake
 * a payment, so it must fail closed.
 */
export async function verifyTransfer(params: {
  txHash: string
  from: string
  to: string
  amountLuna: number
  /** The share's memo, from `paymentMemo`. */
  memo: string
  timeoutMs?: number
}): Promise<VerifyResult> {
  if (!/^[0-9a-fA-F]{64}$/.test(params.txHash)) {
    return { verified: false, reason: 'not_found' }
  }

  let tx: IndexedTx
  try {
    const response = await fetch(`${INDEXER}/transaction/${params.txHash.toLowerCase()}`, {
      signal: AbortSignal.timeout(params.timeoutMs ?? TIMEOUT_MS),
      headers: { accept: 'application/json' },
    })
    if (response.status === 404) return { verified: false, reason: 'not_found' }
    if (!response.ok) return { verified: false, reason: 'unreachable' }
    tx = (await response.json()) as IndexedTx
  } catch {
    // Indexer down, slow or rate-limiting. Not the payer's fault and not a
    // failed payment: the share simply stays unverified and the receiver
    // confirms it by hand.
    return { verified: false, reason: 'unreachable' }
  }

  if (!tx?.hash) return { verified: false, reason: 'not_found' }
  if (tx.executed === false) return { verified: false, reason: 'not_executed' }

  return paysShare(tx, params)
    ? { verified: true, confirmations: tx.confirmations ?? 0 }
    : { verified: false, reason: 'mismatch' }
}

/** A recipient's newest transactions. A share's payment is always recent. */
const RECENT = 50

export type FindResult =
  | { found: true; txHash: string }
  | { found: false; reason: 'not_found' | 'unreachable' }

/**
 * Find a payment of this share that Tanda was never told about: the wallet
 * sent it, and the app lost the answer. In the same three-phone test a payer
 * paid one share twice, 17 seconds apart, and Tanda only ever heard about the
 * second. So before a wallet opens again for a share, and after any refusal
 * the app cannot read, this looks for the first. It matches on the memo,
 * which only this share's payment carries.
 */
export async function findPayment(params: { to: string; amountLuna: number; memo: string }): Promise<FindResult> {
  let txs: unknown
  try {
    const response = await fetch(`${INDEXER}/account-transactions/${slug(params.to)}/${RECENT}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'application/json' },
    })
    if (!response.ok) return { found: false, reason: 'unreachable' }
    txs = await response.json()
  } catch {
    return { found: false, reason: 'unreachable' }
  }
  if (!Array.isArray(txs)) return { found: false, reason: 'unreachable' }

  const match = (txs as IndexedTx[]).find(
    (tx) =>
      typeof tx?.hash === 'string' &&
      tx.executed !== false &&
      decodeMemo(tx.data) === params.memo &&
      paysShare(tx, { ...params, from: '' }),
  )
  return match ? { found: true, txHash: match.hash.toLowerCase() } : { found: false, reason: 'not_found' }
}

/**
 * Balance in Luna, or null if the indexer is unavailable. Used only to word a
 * failed payment precisely; never to block one, since an indexer can lag a
 * wallet that was just topped up.
 */
export async function getBalance(address: string): Promise<number | null> {
  try {
    const response = await fetch(`${INDEXER}/account/${slug(address)}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'application/json' },
    })
    if (!response.ok) return null
    const account = (await response.json()) as { balance?: number }
    return typeof account.balance === 'number' ? account.balance : null
  } catch {
    return null
  }
}
