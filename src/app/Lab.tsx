/**
 * Dev-only component lab. Not shipped, not part of the component budget:
 * it exists so each piece can be looked at in isolation at phone width.
 * Open with ?lab=1
 */
import { useState, type ReactNode } from 'react'
import { MemberRow } from '../components/MemberRow'
import { Ring } from '../components/Ring'
import { RoundCard } from '../components/RoundCard'
import { StatStrip } from '../components/StatStrip'
import type { MemberRow as Row } from '../lib/api'
import { deeplink } from '../lib/links'
import {
  AlreadyPaid,
  CircleFull,
  CodeNotFound,
  ConnectingToWallet,
  CouldNotReach,
  InsufficientBalance,
  OutsideNimiqPay,
  PaymentCancelled,
  WaitingForNetwork,
} from './states'

const member = (over: Partial<Row> & { position: number; displayName: string }): Row => ({
  id: String(over.position),
  address: 'NQ00',
  isYou: false,
  isUp: false,
  shareId: null,
  txHash: null,
  verifiedAt: null,
  state: 'outstanding',
  ...over,
})

const ROSTER: Row[] = [
  member({ position: 1, displayName: 'Amara', state: 'paid' }),
  member({ position: 2, displayName: 'Beatriz', state: 'paid' }),
  member({ position: 3, displayName: 'Chidi', state: 'not due', isUp: true }),
  member({ position: 4, displayName: 'Daniela', state: 'paid' }),
  member({ position: 5, displayName: 'Esi', state: 'sent' }),
  member({ position: 6, displayName: 'Farhan', state: 'outstanding', isYou: true }),
]

function Specimen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-7">
      <p className="label mb-3">{title}</p>
      {children}
    </section>
  )
}

/** Advance `current` to watch §6's settle: gold to mint, next hairline to gold. */
function SettleDemo() {
  const [current, setCurrent] = useState<number | null>(3)
  const next = () => setCurrent((c) => (c === null ? 1 : c >= 6 ? null : c + 1))
  return (
    <div className="flex items-center justify-between" data-settle-demo>
      <Ring
        total={6}
        current={current}
        you={6}
        pot="3,000"
        currency="NIM"
      />
      <button onClick={next} className="label px-3 py-2 rounded-[var(--radius-chip)] bg-raised">
        settle
      </button>
    </div>
  )
}

const noop = () => {}

/** Inline states live inside a sheet or panel; show them in that setting. */
function InSheet({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-ground text-cream font-ui px-4 py-6 max-w-[430px] mx-auto">
      <div className="rounded-[var(--radius-sheet)] bg-surface p-4">
        <p className="label">Round 3 of 6</p>
        <p className="text-title tracking-title mt-1 mb-4">Pay your share</p>
        {children}
      </div>
    </main>
  )
}

/** ?lab=1&state=<name> renders one §11 state full-screen, for screenshots. */
const STATES: Record<string, () => ReactNode> = {
  outside: () => <OutsideNimiqPay link={deeplink()} />,
  connecting: () => <ConnectingToWallet canRetry onRetry={noop} />,
  network: () => <WaitingForNetwork onRetry={noop} />,
  cancelled: () => <InSheet><PaymentCancelled onRetry={noop} /></InSheet>,
  insufficient: () => <InSheet><InsufficientBalance shortfallNim={120} onRetry={noop} /></InSheet>,
  code: () => <CodeNotFound backHref="#" />,
  full: () => <CircleFull memberCount={6} backHref="#" />,
  unreachable: () => <CouldNotReach context="general" onRetry={noop} />,
  unreported: () => <InSheet><CouldNotReach context="payment" layout="inline" recordedHash={'ab12'.repeat(16)} onRetry={noop} /></InSheet>,
  paid: () => (
    <InSheet>
      <AlreadyPaid confirmed={false} recipientName="Chidi" txHash={'ab12'.repeat(16)} verified />
    </InSheet>
  ),
}

export function Lab() {
  const state = new URLSearchParams(location.search).get('state')
  if (state && STATES[state]) return <>{STATES[state]()}</>

  return (
    <main className="min-h-dvh bg-ground text-cream font-ui px-4 py-6 max-w-[430px] mx-auto">
      <p className="label">Lab</p>

      <Specimen title="Ring · settle transition, tap to advance">
        <SettleDemo />
      </Specimen>

      <Specimen title="Stat strip">
        <h1 className="text-title tracking-title mb-2">Sunday Six</h1>
        <StatStrip
          stats={[
            { label: 'Round', value: '3 / 6' },
            { label: 'Pot', value: '3,000 NIM' },
            { label: 'Due', value: 'in 2 days' },
          ]}
        />
        <div className="mt-4">
          <StatStrip
            stats={[
              { label: 'Round', value: '12 / 12' },
              { label: 'Pot', value: '60,000 NIM' },
              { label: 'Due', value: '3d overdue' },
            ]}
          />
        </div>
      </Specimen>

      <Specimen title="Home cards · every state">
        <div className="rounded-[var(--radius-card)] bg-surface divide-y divide-hairline overflow-hidden">
          <RoundCard href="#" name="Sunday Six" total={6} current={3} you={6}
            roundLabel="Round 3 of 6" pot="3,000" currency="NIM" state={{ kind: 'due', days: 2 }} />
          <RoundCard href="#" name="Tuesday Committee" total={6} current={2} you={2}
            roundLabel="Round 2 of 6" pot="6,000" currency="NIM" state={{ kind: 'up' }} />
          <RoundCard href="#" name="Office kitty" total={4} current={4} you={1}
            roundLabel="Round 4 of 4" pot="800" currency="NIM" state={{ kind: 'waiting', members: 2 }} />
          <RoundCard href="#" name="The long one with a name that runs on" total={12} current={9} you={5}
            roundLabel="Round 9 of 12" pot="60,000" currency="NIM" state={{ kind: 'due', days: -3 }} />
          <RoundCard href="#" name="Neighbours 2025" total={5} current={null} you={3}
            roundLabel="Round 5 of 5" pot="2,500" currency="NIM" state={{ kind: 'closed' }} />
          <RoundCard href="#" name="Still forming" total={6} current={0} you={2}
            roundLabel="Forming" pot="3,000" currency="NIM" state={{ kind: 'waiting', members: 4 }} />
        </div>
      </Specimen>

      <Specimen title="Members · every state">
        <div className="rounded-[var(--radius-card)] bg-surface divide-y divide-hairline overflow-hidden">
          {ROSTER.map((m) => (
            <MemberRow key={m.id} member={m} />
          ))}
        </div>
      </Specimen>

      <Specimen title="Ring · first round, closed, and not started">
        <div className="flex flex-col items-center gap-6">
          <Ring total={6} current={1} you={4} pot="3,000" currency="NIM" />
          <Ring total={6} current={null} you={2} pot="3,000" currency="NIM" />
          <Ring total={6} current={0} size={120} />
        </div>
      </Specimen>

      <Specimen title="Ring · 40px, and other member counts">
        <div className="flex items-center gap-4">
          <Ring total={6} current={3} you={6} size={40} />
          <Ring total={3} current={2} you={1} size={40} />
          <Ring total={12} current={7} you={12} size={40} />
        </div>
        <div className="flex flex-wrap gap-4 justify-center mt-6">
          <Ring total={3} current={2} you={3} pot="750" currency="NIM" />
          <Ring total={12} current={7} you={11} pot="6,000" currency="NIM" />
        </div>
      </Specimen>

      {/* The pot fit: every length a real circle can produce, next to the proud edge. */}
      <Specimen title="Ring · centre fit by pot length">
        <div className="flex flex-wrap gap-4 justify-center" data-fit-cases>
          {['3', '1.5', '30', '750', '3,000', '12,000', '600,000', '12,000,000', '0.00003'].map((pot, i) => (
            <Ring key={pot} total={[3, 4, 6, 12][i % 4]} current={1 + (i % 3)} you={2} pot={pot} currency="NIM" />
          ))}
        </div>
      </Specimen>
    </main>
  )
}
