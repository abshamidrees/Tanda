import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CircleScreen } from './CircleScreen'
import { CreateCircle } from './CreateCircle'
import { Home } from './Home'
import { JoinCircle } from './JoinCircle'
import { Lab } from './Lab'
import { PhoneTest } from './PhoneTest'
import { ConnectingToWallet, OutsideNimiqPay, WaitingForNetwork } from './states'
import { devBypass, devIdentity, hostIdentity, impersonating, seedNames } from '../lib/identity'
import { I18nProvider } from '../lib/I18nProvider'
import { messagesFor, sessionLang } from '../lib/i18n'
import { deeplink } from '../lib/links'
import { isConsensusEstablished, isInsideNimiqPay, reconnect } from '../lib/nimiq'
import { closeSession, openSession } from '../lib/session'

const qc = new QueryClient({
  defaultOptions: { queries: { staleTime: 5_000, refetchOnWindowFocus: true } },
})

const params = new URLSearchParams(location.search)

/**
 * No router yet, just the query string: ?create, ?join (the deeplink carries
 * ?join=CODE), ?code= for a circle, and home for anything else.
 */
const code = params.get('code')?.toUpperCase() ?? null
const route = params.has('create') ? 'create' : params.has('join') ? 'join' : code ? 'circle' : 'home'
const joinCode = params.get('join') || null
const showLab = import.meta.env.DEV && params.has('lab')
/** The close-out's phone test. Outside the gate on purpose: it has to report a failing init() too. */
const showProbe = params.has('probe')
const lang = sessionLang()

/** §11: "Connecting to your wallet, with a retry after 8 seconds". */
const RETRY_AFTER_MS = 8_000
/** Inside Nimiq Pay a slow provider is late, not absent, so it gets a long wait. */
const PROVIDER_TIMEOUT_MS = 60_000
const CONSENSUS_POLL_MS = 2_000
/**
 * Nimiq Pay seeds `window.nimiqPay` before page scripts run, so a missing host
 * at first render means this is not Nimiq Pay. The window below only covers a
 * host that seeds late regardless: it is watched without touching the network,
 * and the card stays up the whole time.
 */
const LATE_HOST_WINDOW_MS = 3_000
const LATE_HOST_POLL_MS = 100

/** Dev only: drive the app from a desktop browser, where there is no wallet to gate on. */
const bypassWallet = devBypass()

type Gate =
  | { kind: 'outside' }
  | { kind: 'connecting'; canRetry: boolean }
  | { kind: 'consensus' }
  | { kind: 'ready'; deviceId: string }

/**
 * Decided synchronously, so outside Nimiq Pay the very first paint is the card:
 * no "Connecting to your wallet" for a visitor who has no wallet to connect.
 */
function firstGate(): Gate {
  return bypassWallet || isInsideNimiqPay() ? { kind: 'connecting', canRetry: false } : { kind: 'outside' }
}

export function App() {
  return (
    <I18nProvider lang={lang}>{showLab ? <Lab /> : showProbe ? <PhoneTest /> : <Gated />}</I18nProvider>
  )
}

/**
 * §10: the wallet gates the app, and the gate takes precedence over everything.
 *
 * Outside Nimiq Pay the "open in Nimiq Pay" card is the entire app. Inside it:
 * "connecting" until the provider arrives, "waiting for the network" until
 * consensus, then the host issues an identity. Only then does the session open
 * (lib/session.ts), and only an open session can send a request — so no screen
 * behind the gate can fetch, fail, or render an error in front of it.
 */
function Gated() {
  const [attempt, setAttempt] = useState(0)
  const [gate, setGate] = useState<Gate>(firstGate)

  const retry = () => {
    closeSession()
    setGate(firstGate())
    setAttempt((n) => n + 1)
  }

  useEffect(() => {
    let live = true

    if (!bypassWallet && !isInsideNimiqPay()) {
      // Outside: nothing is awaited and nothing is fetched. Only watch, briefly,
      // for a host that seeds its context late.
      const since = Date.now()
      const watch = setInterval(() => {
        if (isInsideNimiqPay()) {
          clearInterval(watch)
          if (!live) return
          setGate({ kind: 'connecting', canRetry: false })
          setAttempt((n) => n + 1)
        } else if (Date.now() - since > LATE_HOST_WINDOW_MS) {
          clearInterval(watch)
        }
      }, LATE_HOST_POLL_MS)

      return () => {
        live = false
        clearInterval(watch)
      }
    }

    const offerRetry = setTimeout(() => {
      if (live) setGate((g) => (g.kind === 'connecting' ? { kind: 'connecting', canRetry: true } : g))
    }, RETRY_AFTER_MS)

    void (async () => {
      let deviceId: string

      if (bypassWallet) {
        deviceId = devIdentity()
      } else {
        const provider = await reconnect(PROVIDER_TIMEOUT_MS)
        if (!live) return

        if (provider.status === 'absent') {
          setGate({ kind: 'connecting', canRetry: true })
          return
        }

        while (live && !(await isConsensusEstablished().catch(() => false))) {
          setGate((g) => (g.kind === 'consensus' ? g : { kind: 'consensus' }))
          await new Promise((resolve) => setTimeout(resolve, CONSENSUS_POLL_MS))
        }
        if (!live) return

        try {
          deviceId = await hostIdentity(messagesFor(lang).t.identityReason)
        } catch {
          // The prompt was declined, or the host could not issue an identity.
          // Never invent one to carry on with: stay here, and let a retry ask again.
          if (live) setGate({ kind: 'connecting', canRetry: true })
          return
        }
        if (!live) return
      }

      openSession(deviceId)
      setGate({ kind: 'ready', deviceId })
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
      {route === 'create' ? (
        <CreateCircle deviceId={gate.deviceId} />
      ) : route === 'join' ? (
        <JoinCircle initialCode={joinCode} deviceId={gate.deviceId} />
      ) : route === 'circle' && code ? (
        <CircleScreen code={code} deviceId={gate.deviceId} />
      ) : (
        <Home deviceId={gate.deviceId} />
      )}
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
  if (!import.meta.env.DEV) return null
  const current = impersonating()

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
