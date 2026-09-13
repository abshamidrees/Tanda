/**
 * Who this device is.
 *
 * Inside Nimiq Pay that is `requestDeviceIdentifier()` — pseudonymous, scoped
 * to our origin, stable across reinstalls (§10). It identifies a device, not a
 * person, and it never authorises anything that moves money.
 *
 * Production never invents one. No identity from the host means no session,
 * and no session means no request (lib/session.ts) — so a browser that is not
 * Nimiq Pay has nothing to fetch for and shows only the "open in Nimiq Pay"
 * card.
 *
 * In development only, `?as=amara` selects a seeded member so the two-sided
 * flow in §8.6/§8.7 can be driven from a desktop browser — you need two
 * identities to exercise it, and one phone only gives you one.
 */
import { deviceId as requestDeviceId } from './nimiq'

const KEY = 'tanda.device'

/** Seeded members from server/seed.ts. Dev only. */
const SEED_DEVICES: Record<string, string> = {
  amara: 'a'.repeat(64),
  beatriz: 'b'.repeat(64),
  chidi: 'c'.repeat(64),
  daniela: 'd'.repeat(64),
  esi: 'e'.repeat(64),
  farhan: 'f'.repeat(64),
}

export function seedNames(): string[] {
  return Object.keys(SEED_DEVICES)
}

/** The dev `?as=` override, if one is present and recognised. Always null in production. */
export function impersonating(): string | null {
  if (!import.meta.env.DEV) return null
  const who = new URLSearchParams(location.search).get('as')?.toLowerCase()
  return who && who in SEED_DEVICES ? who : null
}

/**
 * The identity Nimiq Pay issues. Rejects outside Nimiq Pay, and when the user
 * declines the prompt; there is deliberately no fallback. `reason` is shown
 * verbatim in the consent prompt, so it arrives localised.
 */
export function hostIdentity(reason: string): Promise<string> {
  return requestDeviceId(reason)
}

/** Development only: a seeded member via `?as=`, or a stable local id for `?browser`. */
export function devIdentity(): string {
  if (!import.meta.env.DEV) throw new Error('Development identities do not exist in production.')

  const who = impersonating()
  if (who) return SEED_DEVICES[who]

  try {
    const stored = localStorage.getItem(KEY)
    if (stored) return stored
    // crypto.randomUUID() is unavailable over plain HTTP, which is how Nimiq
    // Pay loads a local mini app — so never reach for it here (docs/DAY-ONE.md).
    const generated = Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16),
    ).join('')
    localStorage.setItem(KEY, generated)
    return generated
  } catch {
    return '0'.repeat(64)
  }
}

/** Build an in-app link, carrying the dev `?as=` identity and `?lang=` preview when set. */
export function link(params: Record<string, string> = {}): string {
  const search = new URLSearchParams(params)
  const who = impersonating()
  if (who) search.set('as', who)
  const lang = import.meta.env.DEV ? new URLSearchParams(location.search).get('lang') : null
  if (lang) search.set('lang', lang)
  const query = search.toString()
  return query ? `?${query}` : location.pathname
}
