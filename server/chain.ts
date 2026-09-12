/**
 * Chain verification.
 *
 * The Nimiq provider has no transaction-history method — established in
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
}

export type VerifyResult =
  | { verified: true; confirmations: number }
  | { verified: false; reason: 'not_found' | 'mismatch' | 'not_executed' | 'unreachable' }

/** Addresses compare without spacing or case. The indexer returns them spaced. */
const canonical = (address: string) => address.replace(/\s+/g, '').toUpperCase()

/**
 * Does this hash really move this amount from this payer to this recipient?
 *
 * Every field is checked. A hash that exists but pays the wrong person, or the
 * right person too little, is not verification — it is the most obvious way to
 * fake a payment, so it must fail closed.
 */
export async function verifyTransfer(params: {
  txHash: string
  from: string
  to: string
  amountLuna: number
}): Promise<VerifyResult> {
  if (!/^[0-9a-fA-F]{64}$/.test(params.txHash)) {
    return { verified: false, reason: 'not_found' }
  }

  let tx: IndexedTx
  try {
    const response = await fetch(`${INDEXER}/transaction/${params.txHash.toLowerCase()}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'application/json' },
    })
    if (response.status === 404) return { verified: false, reason: 'not_found' }
    if (!response.ok) return { verified: false, reason: 'unreachable' }
    tx = (await response.json()) as IndexedTx
  } catch {
    // Indexer down, slow or rate-limiting. Not the payer's fault and not a
    // failed payment — the share simply stays unverified and the receiver
    // confirms it by hand.
    return { verified: false, reason: 'unreachable' }
  }

  if (!tx?.hash) return { verified: false, reason: 'not_found' }
  if (tx.executed === false) return { verified: false, reason: 'not_executed' }

  const matches =
    canonical(tx.sender_address) === canonical(params.from) &&
    canonical(tx.receiver_address) === canonical(params.to) &&
    // Overpaying a share is still paying it. Underpaying is not.
    tx.value >= params.amountLuna

  return matches
    ? { verified: true, confirmations: tx.confirmations ?? 0 }
    : { verified: false, reason: 'mismatch' }
}

/**
 * Balance in Luna, or null if the indexer is unavailable. Used only to word a
 * failed payment precisely; never to block one, since an indexer can lag a
 * wallet that was just topped up.
 */
export async function getBalance(address: string): Promise<number | null> {
  // The indexer wants dashes where addresses usually carry spaces.
  const slug = address.trim().toUpperCase().replace(/\s+/g, '-')
  try {
    const response = await fetch(`${INDEXER}/account/${slug}`, {
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
