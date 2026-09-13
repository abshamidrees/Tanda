/**
 * The phone test from the close-out (§2). Not product UI: a diagnostics page,
 * opened with ?probe inside Nimiq Pay, that puts each open question to the real
 * provider and prints exactly what came back, for pasting into the next session.
 *
 *   1  does init() resolve, and how long does it take
 *   2  the exact value a CANCELLED payment settles with
 *   3  the exact value a COMPLETED payment returns: a hash, or a serialized transaction
 *   4  the exact value a payment larger than the balance settles with
 *   5  whether the host injects an RPC URL, i.e. whether request() has an escape hatch
 *
 * Remove once the answers are in.
 */
import { useEffect, useState } from 'react'
import { Button } from '../components/Button'
import { Field } from '../components/Field'
import { Toast } from '../components/Toast'
import { copyText } from '../lib/clipboard'
import { LUNA_PER_NIM, hostReport, rawCall, type RawOutcome } from '../lib/nimiq'
import { useToast } from '../lib/useToast'

/** Captured before React renders: was the host context there before our script ran? */
const AT_SCRIPT_START = {
  nimiqPay: typeof window !== 'undefined' && window.nimiqPay !== undefined,
  nimiq: typeof window !== 'undefined' && window.nimiq !== undefined,
  sinceNavigationMs: Math.round(performance.now()),
}

const SMALL_NIM = 0.01
const HUGE_NIM = 1_000_000_000

type Key = 'accounts' | 'cancel' | 'complete' | 'insufficient' | 'rpcRequest'

/** Everything about a value that could matter, including what JSON.stringify drops. */
function describe(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      kind: 'Error',
      name: value.name,
      message: value.message,
      ownProperties: Object.fromEntries(
        Object.getOwnPropertyNames(value)
          .filter((k) => k !== 'stack')
          .map((k) => [k, Reflect.get(value, k)]),
      ),
    }
  }
  if (typeof value === 'string') {
    return {
      typeof: 'string',
      length: value.length,
      isHex64: /^[0-9a-fA-F]{64}$/.test(value),
      value,
    }
  }
  if (value !== null && typeof value === 'object') {
    return {
      typeof: 'object',
      constructor: value.constructor?.name ?? null,
      isArray: Array.isArray(value),
      keys: Object.keys(value),
      value,
    }
  }
  return { typeof: typeof value, value }
}

function render(outcome: RawOutcome) {
  if (outcome.settled === 'resolved') return { ...outcome, value: describe(outcome.value) }
  if (outcome.settled === 'rejected') return { ...outcome, error: describe(outcome.error) }
  return outcome
}

const json = (value: unknown) => JSON.stringify(value, null, 2)

export function PhoneTest() {
  const toast = useToast()
  const [host, setHost] = useState<unknown>(null)
  const [results, setResults] = useState<Partial<Record<Key, unknown>>>({})
  const [busy, setBusy] = useState<Key | null>(null)
  const [recipient, setRecipient] = useState('')

  useEffect(() => {
    let live = true
    void hostReport().then((report) => {
      if (live) setHost(report)
    })
    return () => {
      live = false
    }
  }, [])

  async function run(key: Key, call: Parameters<typeof rawCall>[0]) {
    setBusy(key)
    const outcome = await rawCall(call)
    setResults((r) => ({ ...r, [key]: render(outcome) }))
    setBusy(null)

    if (key === 'accounts' && outcome.settled === 'resolved' && Array.isArray(outcome.value)) {
      const [first, second] = outcome.value as string[]
      setRecipient((current) => current || second || first || '')
    }
  }

  const send = (key: Key, nim: number) =>
    run(key, { method: 'sendBasicTransaction', recipient: recipient.trim(), value: Math.round(nim * LUNA_PER_NIM) })

  const report = [
    'Tanda phone test',
    `when: ${new Date().toISOString()}`,
    `page: ${location.href}`,
    `userAgent: ${navigator.userAgent}`,
    `at script start: ${json(AT_SCRIPT_START)}`,
    `1 init and host: ${json(host)}`,
    `accounts: ${json(results.accounts ?? null)}`,
    `2 cancel: ${json(results.cancel ?? null)}`,
    `3 complete (${SMALL_NIM} NIM): ${json(results.complete ?? null)}`,
    `4 insufficient (${HUGE_NIM} NIM): ${json(results.insufficient ?? null)}`,
    `5 rpc request(getBlockNumber): ${json(results.rpcRequest ?? null)}`,
  ].join('\n\n')

  const step = (n: string, title: string, instruction: string, key: Key, action: () => void, label: string, needsRecipient = true) => (
    <section className="mt-6">
      <p className="label">
        {n} · {title}
      </p>
      <p className="text-body text-muted mt-1">{instruction}</p>
      <Button
        full
        variant="secondary"
        className="mt-3"
        onClick={action}
        disabled={busy !== null || (needsRecipient && !recipient.trim())}
      >
        {busy === key ? 'Waiting…' : label}
      </Button>
      {results[key] !== undefined && (
        <pre className="num text-label text-cream bg-surface rounded-[var(--radius-card)] p-3 mt-3 whitespace-pre-wrap break-all">
          {json(results[key])}
        </pre>
      )}
    </section>
  )

  return (
    <main className="min-h-dvh bg-ground text-cream font-ui px-4 py-6 max-w-[430px] mx-auto">
      <p className="label">Diagnostics</p>
      <h1 className="text-title tracking-title mt-1">Phone test</h1>
      <p className="text-body text-muted mt-2">
        Run each step inside Nimiq Pay, then copy the report and paste it back verbatim. Testnet
        works and costs nothing: long-press settings for 10 seconds to switch.
      </p>

      <section className="mt-6">
        <p className="label">1 · init() and the host</p>
        <pre className="num text-label text-cream bg-surface rounded-[var(--radius-card)] p-3 mt-2 whitespace-pre-wrap break-all">
          {host === null ? 'waiting for init()…' : json({ atScriptStart: AT_SCRIPT_START, ...(host as object) })}
        </pre>
      </section>

      {step(
        '·',
        'Your addresses',
        'Asks Nimiq Pay for your addresses and fills the recipient below. Approve it.',
        'accounts',
        () => run('accounts', { method: 'listAccounts' }),
        'Load my addresses',
        false,
      )}

      <Field
        className="mt-4"
        label="Recipient for steps 2–4"
        mono
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
        placeholder="NQ.. .... ...."
        hint="A second address you control. Your wallet may refuse a payment to itself."
      />

      {step(
        '2',
        'Cancel',
        'Opens a payment. CANCEL it in the wallet. Nothing is sent.',
        'cancel',
        () => send('cancel', SMALL_NIM),
        'Open a payment, then cancel it',
      )}

      {step(
        '3',
        'Complete',
        `Sends ${SMALL_NIM} NIM to the recipient. APPROVE it.`,
        'complete',
        () => send('complete', SMALL_NIM),
        `Send ${SMALL_NIM} NIM and approve it`,
      )}

      {step(
        '4',
        'Too large',
        `Asks for ${HUGE_NIM.toLocaleString('en')} NIM so the wallet has to refuse. If it offers to send, cancel.`,
        'insufficient',
        () => send('insufficient', HUGE_NIM),
        'Try a payment larger than the balance',
      )}

      {step(
        '5',
        'RPC',
        'Calls request() with a method that is not a wallet method. It only works if the host injected an RPC URL.',
        'rpcRequest',
        () => run('rpcRequest', { method: 'request:getBlockNumber' }),
        'Call request(getBlockNumber)',
        false,
      )}

      <Button
        full
        className="mt-8"
        onClick={async () => {
          if (await copyText(report)) toast.show('Report copied')
        }}
      >
        Copy report
      </Button>
      <Toast message={toast.message} id={toast.key} />
    </main>
  )
}
