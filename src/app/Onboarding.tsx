/**
 * §8.1 Onboarding, first open only.
 *
 * Three cards, swiped with the WebView's own scrolling. §7's five animations
 * do not include a carousel, so nothing here moves on its own: the cards sit on
 * scroll snap points, and Next jumps to the next one without a glide.
 *
 * Then never again. Dismissing is stored against the device identifier on the
 * server, which §10 keeps for exactly this, and remembered on the device so a
 * returning open asks nothing at all.
 */
import { useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '../components/Button'
import { PRESS_STYLE, buttonClass } from '../components/buttonClass'
import { Ring } from '../components/Ring'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { link } from '../lib/identity'

const SEEN_KEY = 'tanda.onboarded'

function seenHere(deviceId: string): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === deviceId
  } catch {
    return false
  }
}

function rememberSeen(deviceId: string) {
  try {
    localStorage.setItem(SEEN_KEY, deviceId)
  } catch {
    // Storage refused. The server still has it, so the next open asks once.
  }
}

/**
 * The app, once this device has seen the cards; the cards until then. When
 * Tanda cannot say which, the app opens rather than stalling on an
 * introduction, and the screen behind names the failure (§11).
 */
export function FirstOpen({
  deviceId,
  joinCode,
  children,
}: {
  deviceId: string
  /** The code an invite link carried, if this open came from one. */
  joinCode: string | null
  children: ReactNode
}) {
  const { t } = useI18n()
  const [known] = useState(() => seenHere(deviceId))

  const { data, isPending, isError } = useQuery({
    queryKey: ['device', deviceId],
    enabled: !known,
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      const state = await api.device(deviceId)
      if (state.onboarded) rememberSeen(deviceId)
      return state
    },
  })

  if (known || isError || data?.onboarded) return <>{children}</>

  if (isPending) {
    return (
      <main className="min-h-dvh bg-ground text-cream font-ui px-4 py-6 max-w-[430px] mx-auto">
        <p className="label">{t.reading}</p>
      </main>
    )
  }

  return <Onboarding deviceId={deviceId} joinCode={joinCode} />
}

function Onboarding({ deviceId, joinCode }: { deviceId: string; joinCode: string | null }) {
  const { t } = useI18n()
  const scroller = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(0)

  const onScroll = () => {
    const el = scroller.current
    if (el && el.clientWidth > 0) setPage(Math.round(el.scrollLeft / el.clientWidth))
  }

  const next = () => {
    const el = scroller.current
    el?.scrollTo?.({ left: (page + 1) * el.clientWidth })
  }

  // Remembered here first, so the page this link opens never shows the cards,
  // even if the request is still on its way.
  const dismiss = () => {
    rememberSeen(deviceId)
    void api.markOnboarded(deviceId).catch(() => {})
  }

  // Opened from an invite for the first time: joining is what they came for.
  const start = { label: t.home.start, href: link({ create: '' }) }
  const join = { label: t.home.join, href: link({ join: joinCode ?? '' }) }
  const [primary, secondary] = joinCode ? [join, start] : [start, join]

  const cards: { visual?: ReactNode; title: string; line?: string }[] = [
    { visual: <Ring total={6} current={3} you={5} />, title: t.onboarding.ringTitle, line: t.onboarding.ringLine },
    { title: t.onboarding.custodyTitle, line: t.onboarding.custodyLine },
    { title: t.onboarding.startTitle },
  ]

  return (
    <main
      className="h-dvh bg-ground text-cream font-ui max-w-[430px] mx-auto flex flex-col"
      aria-label={t.onboarding.label}
    >
      <div className="flex justify-center gap-2 pt-6" aria-hidden="true">
        {cards.map((_, i) => (
          <span key={i} className={`size-1.5 rounded-full ${i === page ? 'bg-cream' : 'bg-hairline'}`} />
        ))}
      </div>

      <div
        ref={scroller}
        onScroll={onScroll}
        className="flex-1 flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {cards.map((card, i) => (
          <section
            key={card.title}
            aria-label={t.onboarding.step(i + 1, cards.length)}
            className="w-full shrink-0 snap-center snap-always flex flex-col text-center px-4 pb-6"
          >
            {/* Centred in the space above the actions, so a card without the ring still sits balanced. */}
            <div className="flex-1 flex flex-col items-center justify-center py-6">
              {card.visual && <div className="mb-10">{card.visual}</div>}
              <h2 className="text-title tracking-title text-balance">{card.title}</h2>
              {card.line && <p className="text-body text-muted text-pretty mt-2 max-w-[340px]">{card.line}</p>}
            </div>

            <div className="flex flex-col gap-3 mt-8">
              {i < cards.length - 1 ? (
                <Button full variant="secondary" onClick={next}>
                  {t.onboarding.next}
                </Button>
              ) : (
                [primary, secondary].map((action, n) => (
                  <a
                    key={action.href}
                    href={action.href}
                    onClick={dismiss}
                    className={buttonClass({ variant: n === 0 ? 'primary' : 'secondary', full: true })}
                    style={PRESS_STYLE}
                  >
                    <span className="text-balance">{action.label}</span>
                  </a>
                ))
              )}
            </div>
          </section>
        ))}
      </div>
    </main>
  )
}
