import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CircleScreen } from './CircleScreen'
import { Home } from './Home'
import { Lab } from './Lab'
import { ConnectingToWallet, OutsideNimiqPay, WaitingForNetwork } from './states'
import { deviceIdentity, impersonating, seedNames } from '../lib/identity'
import { I18nProvider } from '../lib/I18nProvider'
import { messagesFor, sessionLang } from '../lib/i18n'
import { deeplink } from '../lib/links'
import { isConsensusEstablished, isInsideNimiqPay, reconnect } from '../lib/nimiq'

const qc = new QueryClient({
  defaultOptions: { queries: { staleTime: 5_000, refetchOnWindowFocus: true } },
})

const params = new URLSearchParams(location.search)

/** No router yet: ?code= opens a circle, anything else is home. */
const code = params.get('code')?.toUpperCase() ?? null
const showLab = import.meta.env.DEV && params.has('lab')
const lang = sessionLang()

/** §11: "Connecting to your wallet, with a retry after 8 seconds". */
const RETRY_AFTER_MS = 8_000
/** With no host context this is almost certainly a desktop browser; don't make it wait. */
const OUTSIDE_TIMEOUT_MS = 2_500
const INSIDE_TIMEOUT_MS = 60_000
const CONSENSUS_POLL_MS = 2_000

/** Dev only: drive the app from a desktop browser, where there is no wallet to gate on. */
const bypassWallet = import.meta.env.DEV && (impersonating() !== null || params.has('browser'))

type Gate =
  | { kind: 'connecting'; canRetry: boolean }
  | { kind: 'outside' }
  | { kind: 'consensus' }
  | { kind: 'ready'; deviceId: string }

export function App() {
  return <I18nProvider lang={lang}>{showLab ? <Lab /> : <Gated />}</I18nProvider>
}

/**
 * §10: init() gates the app. Outside Nimiq Pay, the desktop card. Inside it,
 * "connecting" until the provider arrives, then "waiting for the network"
 * until consensus. Only then does anything else render.
 */
function Gated() {
  const [attempt, setAttempt] = useState(0)
  const [gate, setGate] = useState<Gate>({ kind: 'connecting', canRetry: false })

  const retry = () => {
    setGate({ kind: 'connecting', canRetry: false })
    setAttempt((n) => n + 1)
  }

  useEffect(() => {
    let live = true
    const offerRetry = setTimeout(() => {
      if (live) setGate((g) => (g.kind === 'connecting' ? { kind: 'connecting', canRetry: true } : g))
    }, RETRY_AFTER_MS)

    void (async () => {
      if (!bypassWallet) {
        const inside = isInsideNimiqPay()
        const provider = await reconnect(inside ? INSIDE_TIMEOUT_MS : OUTSIDE_TIMEOUT_MS)
        if (!live) return

        if (provider.status === 'absent') {
          // Inside Nimiq Pay a missing provider is late, not absent: keep the retry.
          setGate(inside ? { kind: 'connecting', canRetry: true } : { kind: 'outside' })
          return
        }

        while (live && !(await isConsensusEstablished().catch(() => false))) {
          setGate((g) => (g.kind === 'consensus' ? g : { kind: 'consensus' }))
          await new Promise((resolve) => setTimeout(resolve, CONSENSUS_POLL_MS))
        }
        if (!live) return
      }

      const deviceId = await deviceIdentity(messagesFor(lang).t.identityReason)
      if (live) setGate({ kind: 'ready', deviceId })
    })()

    return () => {
      live = false
      clearTimeout(offerRetry)
    }
  }, [attempt])

  if (gate.kind === 'outside') return <OutsideNimiqPay link={deeplink()} />
  if (gate.kind === 'connecting') return <ConnectingToWallet canRetry={gate.canRetry} onRetry={retry} />
  if (gate.kind === 'consensus') return <WaitingForNetwork onRetry={retry} />

  return (
    <QueryClientProvider client={qc}>
      {code ? <CircleScreen code={code} deviceId={gate.deviceId} /> : <Home deviceId={gate.deviceId} />}
      <IdentitySwitcher />
    </QueryClientProvider>
  )
}

/**
 * Dev only. The two-sided flow needs two people, and a desktop browser gives
 * you one — this swaps which seeded member you are so paying and confirming
 * can both be driven. Goes away with §8.1 onboarding.
 */
function IdentitySwitcher() {
  const current = impersonating()
  if (!import.meta.env.DEV) return null

  const hrefFor = (name: string) => {
    const next = new URLSearchParams({ ...(code ? { code } : {}), as: name })
    const langParam = params.get('lang')
    if (langParam) next.set('lang', langParam)
    return `?${next}`
  }

  return (
    <div className="max-w-[430px] mx-auto px-4 pb-6">
      <p className="label mb-2">Dev · view as</p>
      <div className="flex flex-wrap gap-2">
        {seedNames().map((name) => (
          <a
            key={name}
            href={hrefFor(name)}
            className={`label px-3 py-2 rounded-[var(--radius-chip)] ${
              current === name ? 'bg-gold text-ground' : 'bg-raised text-muted'
            }`}
          >
            {name}
          </a>
        ))}
      </div>
    </div>
  )
}
