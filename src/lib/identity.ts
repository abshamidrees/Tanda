/**
 * Who this device is.
 *
 * Inside Nimiq Pay that is `requestDeviceIdentifier()` — pseudonymous, scoped
 * to our origin, stable across reinstalls (§10). It identifies a device, not a
 * person, and it never authorises anything that moves money.
 *
 * Outside Nimiq Pay there is no such identifier, so dev falls back to a local
 * one. `?as=amara` selects a seeded member so the two-sided flow in §8.6/§8.7
 * can be driven from a desktop browser — you need two identities to exercise
 * it, and one phone only gives you one.
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

/** The `?as=` override, if one is present and recognised. */
export function impersonating(): string | null {
  const who = new URLSearchParams(location.search).get('as')?.toLowerCase()
  return who && who in SEED_DEVICES ? who : null
}

function localFallback(): string {
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

let pending: Promise<string> | null = null

/** `reason` is shown verbatim in Nimiq Pay's consent prompt, so it arrives localised. */
export function deviceIdentity(reason: string): Promise<string> {
  pending ??= (async () => {
    // An explicit ?as= wins, so the flow stays drivable inside Pay too.
    if (impersonating()) return localFallback()
    try {
      return await requestDeviceId(reason)
    } catch {
      // Not inside Nimiq Pay, or the user declined the prompt.
      return localFallback()
    }
  })()
  return pending
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
