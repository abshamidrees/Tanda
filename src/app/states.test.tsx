/**
 * §11: "Write a test that renders each of these."
 *
 * All nine states, in English and Spanish. Each must render a title, then one
 * line of explanation, then an action. English is pinned to the brief's own
 * words; Spanish is pinned to written-out copy, so the catalog is checked
 * against something other than itself.
 */
import type { ReactElement } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { I18nProvider } from '../lib/I18nProvider'
import type { Lang } from '../lib/i18n'
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

afterEach(cleanup)

const noop = () => {}
const LINK = 'https://nimpay.app/miniapps/open/tanda.example'
const HASH = 'ab12'.repeat(16)

interface Case {
  state: string
  element: ReactElement
  title: string
  line: string
  action: { role: 'button' | 'link'; name: string }
}

/** Every §11 row, keyed to the brief's own wording where it gives one. */
const english: Case[] = [
  {
    state: 'opened outside Nimiq Pay',
    element: <OutsideNimiqPay link={LINK} />,
    title: 'Tanda runs inside Nimiq Pay',
    line: 'Open the link on your phone, or scan this code with Nimiq Pay.',
    action: { role: 'button', name: 'Copy link' },
  },
  {
    state: 'provider not ready',
    element: <ConnectingToWallet canRetry onRetry={noop} />,
    title: 'Connecting to your wallet', // §11 verbatim
    line: 'Nimiq Pay is getting your wallet ready.',
    action: { role: 'button', name: 'Try again' },
  },
  {
    state: 'consensus not established',
    element: <WaitingForNetwork onRetry={noop} />,
    title: 'Waiting for the network', // §11: "Waiting for the network. This usually takes a few seconds."
    line: 'This usually takes a few seconds.',
    action: { role: 'button', name: 'Check again' },
  },
  {
    state: 'user rejects the send dialog',
    element: <PaymentCancelled onRetry={noop} />,
    title: 'Payment cancelled', // §11: "Payment cancelled. Nothing was sent."
    line: 'Nothing was sent.',
    action: { role: 'button', name: 'Try again' },
  },
  {
    state: 'insufficient balance',
    element: <InsufficientBalance shortfallNim={120} onRetry={noop} />,
    title: 'Not enough NIM',
    line: 'Your balance is short by 120 NIM.', // §11 verbatim, exact shortfall
    action: { role: 'button', name: 'Try again' },
  },
  {
    state: 'invalid or expired code',
    element: <CodeNotFound backHref="/" />,
    title: 'Code not found',
    line: 'That code does not match a circle.', // §11 verbatim
    action: { role: 'link', name: 'Back to circles' },
  },
  {
    state: 'circle already full',
    element: <CircleFull memberCount={6} backHref="/" />,
    title: 'Circle is full',
    line: 'This circle already has all 6 members.', // §11 verbatim
    action: { role: 'link', name: 'Back to circles' },
  },
  {
    state: 'network request fails',
    element: <CouldNotReach onRetry={noop} />,
    title: 'Could not reach Tanda', // §11: "Could not reach Tanda. Your payment is unaffected."
    line: 'Your payment is unaffected.',
    action: { role: 'button', name: 'Try again' },
  },
  {
    state: 'already paid this round',
    element: <AlreadyPaid confirmed recipientName="Chidi" txHash={HASH} verified={false} />,
    title: 'Paid',
    line: 'Chidi confirmed it arrived.',
    action: { role: 'button', name: 'Copy transaction hash' },
  },
]

const spanish: Case[] = [
  {
    ...english[0],
    title: 'Tanda funciona dentro de Nimiq Pay',
    line: 'Abre el enlace en tu teléfono o escanea este código con Nimiq Pay.',
    action: { role: 'button', name: 'Copiar enlace' },
  },
  {
    ...english[1],
    title: 'Conectando con tu billetera',
    line: 'Nimiq Pay está preparando tu billetera.',
    action: { role: 'button', name: 'Reintentar' },
  },
  {
    ...english[2],
    title: 'Esperando a la red',
    line: 'Suele tardar unos segundos.',
    action: { role: 'button', name: 'Comprobar de nuevo' },
  },
  {
    ...english[3],
    title: 'Pago cancelado',
    line: 'No se envió nada.',
    action: { role: 'button', name: 'Intentar de nuevo' },
  },
  {
    ...english[4],
    title: 'Saldo insuficiente',
    line: 'A tu saldo le faltan 120 NIM.',
    action: { role: 'button', name: 'Intentar de nuevo' },
  },
  {
    ...english[5],
    title: 'Código no encontrado',
    line: 'Ese código no corresponde a ningún círculo.',
    action: { role: 'link', name: 'Volver a tus círculos' },
  },
  {
    ...english[6],
    title: 'Círculo completo',
    line: 'Este círculo ya tiene a sus 6 miembros.',
    action: { role: 'link', name: 'Volver a tus círculos' },
  },
  {
    ...english[7],
    title: 'No pudimos conectar con Tanda',
    line: 'Tu pago no se ve afectado.',
    action: { role: 'button', name: 'Reintentar' },
  },
  {
    ...english[8],
    title: 'Pagado',
    line: 'Chidi confirmó que llegó.',
    action: { role: 'button', name: 'Copiar hash de la transacción' },
  },
]

function renderIn(lang: Lang, element: ReactElement) {
  return render(<I18nProvider lang={lang}>{element}</I18nProvider>)
}

describe.each([
  ['en', english],
  ['es', spanish],
] as const)('§11 error states (%s)', (lang, cases) => {
  it.each(cases)('$state: a title, one line of explanation, an action', ({ element, title, line, action }) => {
    renderIn(lang, element)

    // A title...
    const heading = screen.getByRole('heading', { name: title })

    // ...followed directly by exactly one line of explanation...
    const explanation = heading.nextElementSibling
    expect(explanation?.tagName).toBe('P')
    expect(explanation?.textContent).toBe(line)

    // ...and an action.
    expect(screen.getByRole(action.role, { name: action.name })).toBeTruthy()

    // §11: never disabled-and-silent.
    for (const button of screen.queryAllByRole('button')) {
      expect((button as HTMLButtonElement).disabled).toBe(false)
    }
  })

  it('every state in this language renders', () => {
    expect(cases).toHaveLength(9)
  })
})

describe('§11 details the table asks for', () => {
  it('outside Nimiq Pay shows the deeplink and a QR code', () => {
    const { container } = renderIn('en', <OutsideNimiqPay link={LINK} />)
    // The link is split at its slashes so it wraps cleanly; read it whole.
    const printed = [...container.querySelectorAll('p')].find((p) => p.textContent === LINK)
    expect(printed).toBeTruthy()
    const qr = container.querySelector('svg path')
    // A real code has hundreds of modules, not an empty path.
    expect((qr?.getAttribute('d') ?? '').split('M').length).toBeGreaterThan(200)
  })

  it('withholds the wallet retry until it is offered (the first 8 seconds)', () => {
    renderIn('en', <ConnectingToWallet canRetry={false} onRetry={noop} />)
    expect(screen.getByRole('heading', { name: 'Connecting to your wallet' })).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('names the exact shortfall, in mono', () => {
    renderIn('en', <InsufficientBalance shortfallNim={120.5} onRetry={noop} />)
    const amount = screen.getByText('120.5 NIM')
    expect(amount.classList.contains('num')).toBe(true)
  })

  it('formats Spanish amounts the Latin American way', () => {
    renderIn('es', <InsufficientBalance shortfallNim={1500} onRetry={noop} />)
    expect(screen.getByText('1,500 NIM')).toBeTruthy()
  })

  it('an unreported payment retries the record, and says the money already moved', () => {
    renderIn('en', <CouldNotReach layout="inline" recordedHash={HASH} onRetry={noop} />)
    expect(screen.getByText('Your payment is unaffected and will be recorded.')).toBeTruthy()
    expect(screen.getByText(`${HASH.slice(0, 16)}… saved on this device`)).toBeTruthy()
    expect(screen.getByRole('status')).toBeTruthy() // mint, not an alert: nothing went wrong with the money
  })

  it('a sent-but-unconfirmed share says who still has to confirm', () => {
    renderIn('en', <AlreadyPaid confirmed={false} recipientName="Chidi" txHash={HASH} verified />)
    expect(screen.getByRole('heading', { name: 'Sent, waiting for confirmation' })).toBeTruthy()
    expect(screen.getByText('Chidi still has to confirm it arrived.')).toBeTruthy()
    expect(screen.getByText(/verified on chain/)).toBeTruthy()
  })

  it('the Spanish screens carry no English from §11', () => {
    const { container } = renderIn(
      'es',
      <>
        {spanish.map(({ element, state }) => (
          <div key={state}>{element}</div>
        ))}
      </>,
    )
    const text = container.textContent ?? ''
    for (const { title, line } of english) {
      expect(text).not.toContain(title === 'Paid' ? 'Paid ' : title)
      expect(text).not.toContain(line)
    }
  })
})
