/**
 * The close-out's rules and the two new screens.
 *
 *   §4a  the closing summary's figures agree with the wallet
 *   §4b  coral means owed: an unpaid share is `not due` until its due date passes
 *   §8.3 create: the live summary recomputes, and an incomplete form sends nothing
 *   §8.4 join: the full terms and your seat before committing; named errors
 */
import type { ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { MemberRow } from '../components/MemberRow'
import { I18nProvider } from '../lib/I18nProvider'
import type { CircleView, MemberRow as Row } from '../lib/api'
import type { Lang } from '../lib/i18n'
import { openSession } from '../lib/session'
import { ClosingSummary } from './ClosingSummary'
import { CreateCircle } from './CreateCircle'
import { JoinCircle } from './JoinCircle'

const DEVICE = 'd'.repeat(64)

beforeAll(() => openSession(DEVICE))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

function renderIn(element: ReactElement, lang: Lang = 'en') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider lang={lang}>{element}</I18nProvider>
    </QueryClientProvider>,
  )
}

const member = (over: Partial<Row> & { position: number; displayName: string }): Row => ({
  id: `m${over.position}`,
  address: `NQ0${over.position}`,
  isYou: false,
  isUp: false,
  shareId: null,
  txHash: null,
  verifiedAt: null,
  state: 'not due',
  ...over,
})

function view(over: { circle?: Partial<CircleView['circle']>; you?: CircleView['you']; members?: Row[] } = {}): CircleView {
  return {
    circle: {
      id: 'c1',
      code: 'ABC234',
      name: 'Friday Six',
      shareAmount: 50_000_000,
      shareNim: 500,
      currency: 'NIM',
      frequency: 'weekly',
      memberCount: 6,
      status: 'forming',
      createdAt: '2026-09-13T00:00:00.000Z',
      pot: 300_000_000,
      potNim: 3000,
      totalRounds: 6,
      seatsRemaining: 4,
      ...over.circle,
    },
    you: over.you ?? null,
    members: over.members ?? [member({ position: 1, displayName: 'Ana' }), member({ position: 2, displayName: 'Bo' })],
    round: null,
    history: [],
  }
}

/**
 * A sentence whose numbers sit in mono spans (§4) is still one line to a
 * person: match the innermost element whose whole text is the sentence.
 */
const line = (text: string) =>
  screen.getByText(
    (_, element) =>
      element?.textContent === text &&
      ![...(element?.children ?? [])].some((child) => child.textContent === text),
  )

const respond = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))

describe('§4b coral means owed, not merely unpaid', () => {
  const chip = () => screen.getByText(/^(paid|sent|outstanding|not due|no debe|pendiente)$/i)

  it('an unpaid share before its due date reads not due, muted', () => {
    renderIn(<MemberRow member={member({ position: 6, displayName: 'Farhan', state: 'outstanding' })} overdue={false} />)
    expect(chip().textContent).toBe('not due')
    expect(chip().className).toContain('chip-notdue')
  })

  it('the same share after the due date turns coral', () => {
    renderIn(<MemberRow member={member({ position: 6, displayName: 'Farhan', state: 'outstanding' })} overdue />)
    expect(chip().textContent).toBe('outstanding')
    expect(chip().className).toContain('chip-outstanding')
  })

  it('a paid share is mint either way', () => {
    renderIn(<MemberRow member={member({ position: 1, displayName: 'Amara', state: 'paid' })} overdue />)
    expect(chip().className).toContain('chip-paid')
  })

  it('holds in Spanish', () => {
    renderIn(<MemberRow member={member({ position: 6, displayName: 'Farhan', state: 'outstanding' })} overdue={false} />, 'es')
    expect(chip().textContent).toBe('no debe')
  })
})

describe('§4a the closing summary agrees with the wallet', () => {
  it('names what was sent, the own share offset against the pot, the contribution and the pot received', () => {
    const closed = view({
      circle: { status: 'closed', seatsRemaining: 0 },
      you: {
        memberId: 'm3',
        position: 3,
        displayName: 'Chidi',
        address: 'NQ03',
        totals: {
          sent: 250_000_000,
          sentNim: 2500,
          ownShare: 50_000_000,
          ownShareNim: 500,
          contributed: 300_000_000,
          contributedNim: 3000,
          received: 300_000_000,
          receivedNim: 3000,
        },
      },
    })
    const { container } = renderIn(<ClosingSummary view={closed} deviceId={DEVICE} />)
    const rows = [...container.querySelectorAll('.divide-y > div')].map((row) => row.textContent)

    expect(rows).toEqual([
      'You sent2,500 NIM',
      'Your own shareoffset against your pot500 NIM',
      'You contributed3,000 NIM',
      'You received3,000 NIM',
    ])
    expect(screen.getByText('Everyone is square.')).toBeTruthy()
  })
})

describe('§8.3 create', () => {
  const summary = () => screen.getByText(/^Each member pays/).textContent

  it('recomputes the summary as they type, including a Spanish decimal comma', () => {
    renderIn(<CreateCircle deviceId={DEVICE} />)

    fireEvent.change(screen.getByLabelText('Share per round'), { target: { value: '500' } })
    expect(summary()).toBe('Each member pays 500 NIM × 6 rounds = 3,000 NIM')

    fireEvent.click(screen.getByRole('button', { name: 'One more member' }))
    expect(summary()).toBe('Each member pays 500 NIM × 7 rounds = 3,500 NIM')

    fireEvent.change(screen.getByLabelText('Share per round'), { target: { value: '500,5' } })
    expect(summary()).toBe('Each member pays 500.5 NIM × 7 rounds = 3,503.5 NIM')
  })

  it('keeps members between 3 and 12', () => {
    renderIn(<CreateCircle deviceId={DEVICE} />)
    const fewer = screen.getByRole('button', { name: 'One fewer member' })
    for (let i = 0; i < 10; i++) fireEvent.click(fewer)
    expect((fewer as HTMLButtonElement).disabled).toBe(true)
    expect(summary()).toContain('× 3 rounds')
  })

  it('an incomplete form names what is missing and sends nothing', async () => {
    const fetchSpy = respond({})
    vi.stubGlobal('fetch', fetchSpy)
    renderIn(<CreateCircle deviceId={DEVICE} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create circle' }))
    })
    expect(screen.getByText('Give the circle a name.')).toBeTruthy()
    expect(screen.getByText('Enter a share above zero.')).toBeTruthy()
    expect(screen.getByText('Add your name.')).toBeTruthy()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('shows the data disclosure where the data is entered', () => {
    renderIn(<CreateCircle deviceId={DEVICE} />)
    expect(screen.getByText(/Tanda stores the circle, your name, your Nimiq address/)).toBeTruthy()
  })
})

describe('§8.4 join', () => {
  it('from the deeplink, shows the terms, the rotation and the seat you would take', async () => {
    vi.stubGlobal('fetch', respond(view()))
    renderIn(<JoinCircle initialCode="abc-234" deviceId={DEVICE} />)
    await act(async () => {})

    expect(screen.getByRole('heading', { name: 'Friday Six' })).toBeTruthy()
    expect(line('You would be up in round 3 of 6')).toBeTruthy()
    expect(line('About 2 weeks after it starts')).toBeTruthy()
    expect(line('It starts when 4 more join, you included.')).toBeTruthy()
    // The whole rotation: two seated, your seat, three still open.
    expect(screen.getByText('Ana')).toBeTruthy()
    expect(screen.getByText('Bo')).toBeTruthy()
    expect(screen.getAllByText('Open seat')).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Join circle' })).toBeTruthy()
  })

  it('the first seat opens as soon as the circle starts, and the last seat starts it', async () => {
    vi.stubGlobal('fetch', respond(view({ circle: { memberCount: 3, seatsRemaining: 1 } })))
    renderIn(<JoinCircle initialCode="ABC234" deviceId={DEVICE} />)
    await act(async () => {})
    expect(screen.getByText('The circle starts as soon as you join.')).toBeTruthy()
  })

  it('an unknown code says so, in §11 words, on the field', async () => {
    vi.stubGlobal('fetch', respond({ error: { code: 'CODE_NOT_FOUND', message: 'x' } }, 404))
    renderIn(<JoinCircle initialCode="ZZZZZZ" deviceId={DEVICE} />)
    await act(async () => {})
    expect(screen.getByText('That code does not match a circle.')).toBeTruthy()
  })

  it('a circle that has already started is the full state, with its member count', async () => {
    vi.stubGlobal('fetch', respond(view({ circle: { status: 'active', seatsRemaining: 0 } })))
    renderIn(<JoinCircle initialCode="ABC234" deviceId={DEVICE} />)
    await act(async () => {})
    expect(screen.getByRole('heading', { name: 'Circle is full' })).toBeTruthy()
    expect(line('This circle already has all 6 members.')).toBeTruthy()
  })
})
