/**
 * The provider wrapper: the SDK resolves its error arm instead of rejecting,
 * so lib/nimiq.ts is the one place that must tell an error from a result.
 * An error in a shape the .d.ts does not promise has to reject all the same.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

async function withProvider(listAccounts: () => Promise<unknown>) {
  vi.resetModules()
  window.nimiq = {
    getNetwork: () => 'nimiq',
    getRPC: () => undefined,
    getBlockNumber: async () => 1,
    isConsensusEstablished: async () => true,
    listAccounts,
  } as unknown as Window['nimiq']
  return import('./nimiq')
}

afterEach(() => {
  delete (window as { nimiq?: unknown }).nimiq
})

describe('unwrap', () => {
  it('rejects an error that is a bare string, rather than returning it as a result', async () => {
    const { listAccounts, NimiqCallError } = await withProvider(async () => ({ error: 'Denied by user' }))
    const call = listAccounts()
    await expect(call).rejects.toBeInstanceOf(NimiqCallError)
    await expect(call).rejects.toThrow('Denied by user')
  })

  it('rejects an error object with no message, and keeps what was in it', async () => {
    const { listAccounts } = await withProvider(async () => ({ error: { code: 4001 } }))
    await expect(listAccounts()).rejects.toThrow('4001')
  })

  it('still returns a real result', async () => {
    const address = 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000'
    const { listAccounts } = await withProvider(async () => [address])
    await expect(listAccounts()).resolves.toEqual([address])
  })
})
