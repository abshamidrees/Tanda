/**
 * The wallet session: the one fact every request depends on.
 *
 * It opens exactly once, when the §10 gate resolves inside Nimiq Pay with an
 * identity the host issued. Until then lib/api.ts sends nothing at all.
 * Outside Nimiq Pay it never opens, because there is nobody to fetch for.
 *
 * This is deliberately a guard in the API client rather than a rule about
 * which component mounts first: render order is easy to get wrong, and a
 * request that cannot leave the device cannot show an error over the gate.
 */

let device: string | null = null

export function openSession(deviceId: string) {
  device = deviceId
}

/** A retry re-runs the gate from nothing, so the old session must not linger. */
export function closeSession() {
  device = null
}

export function isSessionOpen(): boolean {
  return device !== null
}
