/**
 * Every word the user reads, in English and Spanish (§10).
 *
 * The language is Nimiq Pay's `window.nimiqPay.language`, read through
 * lib/nimiq.ts — never `navigator.language`. It is static for the session, so
 * it is resolved once at the root and handed down through context.
 *
 * Spanish matters here beyond coverage: *tanda* is the Latin American word for
 * this whole practice. Word choices avoid anything that reads as gambling in
 * Spanish (§2): no "pozo" (as in "pozo acumulado", a lottery jackpot), no
 * "bote", no "sorteo", no "ganar".
 */
import { createContext, useContext } from 'react'
import { hostLanguage } from './nimiq'

export type Lang = 'en' | 'es'

export function resolveLang(code: string | null | undefined): Lang {
  return code?.toLowerCase().startsWith('es') ? 'es' : 'en'
}

/**
 * The host sends a bare ISO 639-1 code. Plain `es` formats the Spain way —
 * measured: 3000 renders "3000" and 60000 renders "60.000" — while `es-419`
 * gives "3,000" and "60,000", which is what the Latin American users §10 is
 * written for expect.
 */
const LOCALE: Record<Lang, string> = { en: 'en', es: 'es-419' }

/** Locale-bound formatting. Every number renders mono (§4), mid-sentence too. */
function formatters(lang: Lang) {
  const number = new Intl.NumberFormat(LOCALE[lang], { maximumFractionDigits: 5 })
  return {
    n: (value: number) => <span className="num">{number.format(value)}</span>,
    nim: (value: number) => <span className="num">{number.format(value)} NIM</span>,
    plain: (value: number) => number.format(value),
    date: (iso: string) =>
      new Date(iso).toLocaleDateString(LOCALE[lang], { day: 'numeric', month: 'short' }),
  }
}

type Format = ReturnType<typeof formatters>
const plural = (count: number, one: string, other: string) => (count === 1 ? one : other)

const en = ({ n, nim }: Format) => ({
  reading: 'reading',
  close: 'Close',
  copied: 'Copied',
  somethingWrong: 'Something went wrong.',
  identityReason: 'So Tanda can remember which circles this device belongs to.',
  footer: 'Tanda never holds your money. Payments go wallet to wallet through Nimiq Pay.',

  word: {
    pot: 'Pot',
    round: 'Round',
    due: 'Due',
    members: 'Members',
    thisRound: 'This round',
    circles: 'Circles',
    forming: 'Forming',
    closed: 'Closed',
    you: 'you',
    weekly: 'weekly',
    monthly: 'monthly',
  },
  roundOf: (round: number, total: number) => `Round ${round} of ${total}`,
  /** Stat strip values, sized for a third of a phone's width. */
  dueShort: (days: number) =>
    days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'today' : days === 1 ? 'in 1 day' : `in ${days} days`,

  chip: { paid: 'paid', sent: 'sent', outstanding: 'outstanding', 'not due': 'not due' },
  sentWaiting: 'sent, waiting for confirmation',
  verifiedOnChain: 'verified on chain',

  home: {
    emptyTitle: 'No circles yet',
    emptyLine:
      'Everyone pays the same share each round, and one member takes the pot. The turn rotates until everyone has had one.',
    start: 'Start a circle',
    join: 'Join with a code',
    up: 'You are up',
    dueToday: 'Your share is due today',
    dueTomorrow: 'Your share is due tomorrow',
    dueIn: (days: number) => <>Your share is due in {n(days)} days</>,
    overdue: (days: number) => <>Your share is {n(days)} {plural(days, 'day', 'days')} overdue</>,
    waiting: (count: number) => <>Waiting on {n(count)} {plural(count, 'member', 'members')}</>,
  },

  circle: {
    youAreUp: 'You are up',
    youReceive: (pot: number) => <>You receive {nim(pot)} once every share is confirmed.</>,
    isUp: (name: string, position: number) => <>{name} is up · position {n(position)}</>,
    payYourShare: (share: number) => <>Pay your share · {nim(share)}</>,
    notAMember: 'You are not a member of this circle.',
    history: (count: number) => <>History · {n(count)} settled</>,
  },

  confirm: {
    heading: 'Incoming shares',
    confirmed: 'confirmed',
    action: 'Confirm received',
    working: 'Confirming…',
    allIn: 'Every share is in. The round settles and the turn moves on.',
    waiting: (count: number) => (
      <>
        Waiting on {n(count)} {plural(count, 'member', 'members')}. Confirming is yours alone —
        nobody can mark their own payment received.
      </>
    ),
    offline: 'Could not reach Tanda. Nothing has changed.',
  },

  pay: {
    title: 'Pay your share',
    to: 'To',
    address: 'Address',
    amount: 'Amount',
    action: 'Confirm in wallet',
    working: 'Waiting for your wallet…',
    recording: 'Recording your payment…',
    explain: (name: string) =>
      `This opens Nimiq Pay. The payment goes straight to ${name}. Tanda never holds your money.`,
    walletTitle: 'Payment not sent',
    walletFailed: 'The wallet could not send it. Nothing was sent.',
    alreadySettled: 'This share is already settled.',
    savedOnDevice: (hash: string) => `${hash.slice(0, 16)}… saved on this device`,
  },

  closing: {
    youPaid: 'You paid',
    youReceived: 'You received',
    square: 'Everyone is square.',
    startAnother: 'Start another circle with the same members',
    sheetTitle: 'Start another circle',
    terms: (name: string, members: number, frequency: string) => (
      <>
        {name} · {n(members)} members · {frequency}
      </>
    ),
    eachPays: (share: number, rounds: number, total: number) => (
      <>
        Each member pays {nim(share)} × {n(rounds)} rounds = {nim(total)}
      </>
    ),
    eachReceives: (total: number) => <>Each member receives {nim(total)}</>,
    endsSquare: 'Everyone ends square.',
    create: 'Create circle',
    creating: 'Creating…',
    shareCode: 'Share this code with the group',
    copyInvite: 'Copy invite link',
    openNew: 'Open the new circle',
  },

  /** §11. Every state: a title, one line of explanation, an action. */
  states: {
    outside: {
      title: 'Tanda runs inside Nimiq Pay',
      line: 'Open the link on your phone, or scan this code with Nimiq Pay.',
      action: 'Copy link',
    },
    connecting: {
      title: 'Connecting to your wallet',
      line: 'Nimiq Pay is getting your wallet ready.',
      action: 'Try again',
    },
    network: {
      title: 'Waiting for the network',
      line: 'This usually takes a few seconds.',
      action: 'Check again',
    },
    cancelled: {
      title: 'Payment cancelled',
      line: 'Nothing was sent.',
      action: 'Try again',
    },
    insufficient: {
      title: 'Not enough NIM',
      line: (shortfall: number) => <>Your balance is short by {nim(shortfall)}.</>,
      lineUnknown: 'Your balance is too low to pay this share.',
      action: 'Try again',
    },
    codeNotFound: {
      title: 'Code not found',
      line: 'That code does not match a circle.',
      action: 'Back to circles',
    },
    circleFull: {
      title: 'Circle is full',
      line: (members: number) => <>This circle already has all {n(members)} members.</>,
      action: 'Back to circles',
    },
    unreachable: {
      title: 'Could not reach Tanda',
      line: 'Your payment is unaffected.',
      lineRecorded: 'Your payment is unaffected and will be recorded.',
      action: 'Try again',
    },
    alreadyPaid: {
      titlePaid: 'Paid',
      titleSent: 'Sent, waiting for confirmation',
      linePaid: (name: string) => `${name} confirmed it arrived.`,
      lineSent: (name: string) => `${name} still has to confirm it arrived.`,
      action: 'Copy transaction hash',
    },
  },
})

export type Messages = ReturnType<typeof en>

const es = ({ n, nim }: Format): Messages => ({
  reading: 'leyendo',
  close: 'Cerrar',
  copied: 'Copiado',
  somethingWrong: 'Algo salió mal.',
  identityReason: 'Para que Tanda recuerde a qué círculos pertenece este dispositivo.',
  footer: 'Tanda nunca guarda tu dinero. Los pagos van de billetera a billetera a través de Nimiq Pay.',

  word: {
    pot: 'Bolsa',
    round: 'Ronda',
    due: 'Vence',
    members: 'Miembros',
    thisRound: 'Esta ronda',
    circles: 'Círculos',
    forming: 'En formación',
    closed: 'Cerrado',
    you: 'tú',
    weekly: 'semanal',
    monthly: 'mensual',
  },
  roundOf: (round: number, total: number) => `Ronda ${round} de ${total}`,
  dueShort: (days: number) =>
    days < 0 ? `${Math.abs(days)} d tarde` : days === 0 ? 'hoy' : days === 1 ? 'en 1 día' : `en ${days} días`,

  chip: { paid: 'pagado', sent: 'enviado', outstanding: 'pendiente', 'not due': 'no debe' },
  sentWaiting: 'enviado, esperando confirmación',
  verifiedOnChain: 'verificado en blockchain',

  home: {
    emptyTitle: 'Aún no tienes círculos',
    emptyLine:
      'Todos pagan la misma cuota cada ronda y un miembro recibe la bolsa. El turno rota hasta que a todos les toque.',
    start: 'Empezar un círculo',
    join: 'Unirme con un código',
    up: 'Te toca',
    dueToday: 'Tu cuota vence hoy',
    dueTomorrow: 'Tu cuota vence mañana',
    dueIn: (days: number) => <>Tu cuota vence en {n(days)} días</>,
    overdue: (days: number) => <>Tu cuota lleva {n(days)} {plural(days, 'día', 'días')} de atraso</>,
    waiting: (count: number) => <>Esperando a {n(count)} {plural(count, 'miembro', 'miembros')}</>,
  },

  circle: {
    youAreUp: 'Te toca',
    youReceive: (pot: number) => <>Recibes {nim(pot)} cuando se confirmen todas las cuotas.</>,
    isUp: (name: string, position: number) => <>Le toca a {name} · posición {n(position)}</>,
    payYourShare: (share: number) => <>Pagar tu cuota · {nim(share)}</>,
    notAMember: 'No eres miembro de este círculo.',
    history: (count: number) => <>Historial · {n(count)} {plural(count, 'saldada', 'saldadas')}</>,
  },

  confirm: {
    heading: 'Cuotas entrantes',
    confirmed: 'confirmado',
    action: 'Confirmar recibido',
    working: 'Confirmando…',
    allIn: 'Llegaron todas las cuotas. La ronda se salda y el turno avanza.',
    waiting: (count: number) => (
      <>
        Esperando a {n(count)} {plural(count, 'miembro', 'miembros')}. Solo tú puedes confirmar:
        nadie puede marcar como recibido su propio pago.
      </>
    ),
    offline: 'No pudimos conectar con Tanda. No cambió nada.',
  },

  pay: {
    title: 'Paga tu cuota',
    to: 'Para',
    address: 'Dirección',
    amount: 'Monto',
    action: 'Confirmar en la billetera',
    working: 'Esperando a tu billetera…',
    recording: 'Registrando tu pago…',
    explain: (name: string) =>
      `Se abrirá Nimiq Pay. El pago va directo a ${name}. Tanda nunca guarda tu dinero.`,
    walletTitle: 'Pago no enviado',
    walletFailed: 'La billetera no pudo enviarlo. No se envió nada.',
    alreadySettled: 'Esta cuota ya está saldada.',
    savedOnDevice: (hash: string) => `${hash.slice(0, 16)}… guardado en este dispositivo`,
  },

  closing: {
    youPaid: 'Pagaste',
    youReceived: 'Recibiste',
    square: 'Todos quedan a mano.',
    startAnother: 'Empezar otro círculo con los mismos miembros',
    sheetTitle: 'Empezar otro círculo',
    terms: (name: string, members: number, frequency: string) => (
      <>
        {name} · {n(members)} miembros · {frequency}
      </>
    ),
    eachPays: (share: number, rounds: number, total: number) => (
      <>
        Cada miembro paga {nim(share)} × {n(rounds)} rondas = {nim(total)}
      </>
    ),
    eachReceives: (total: number) => <>Cada miembro recibe {nim(total)}</>,
    endsSquare: 'Todos terminan a mano.',
    create: 'Crear círculo',
    creating: 'Creando…',
    shareCode: 'Comparte este código con el grupo',
    copyInvite: 'Copiar enlace de invitación',
    openNew: 'Abrir el nuevo círculo',
  },

  states: {
    outside: {
      title: 'Tanda funciona dentro de Nimiq Pay',
      line: 'Abre el enlace en tu teléfono o escanea este código con Nimiq Pay.',
      action: 'Copiar enlace',
    },
    connecting: {
      title: 'Conectando con tu billetera',
      line: 'Nimiq Pay está preparando tu billetera.',
      action: 'Reintentar',
    },
    network: {
      title: 'Esperando a la red',
      line: 'Suele tardar unos segundos.',
      action: 'Comprobar de nuevo',
    },
    cancelled: {
      title: 'Pago cancelado',
      line: 'No se envió nada.',
      action: 'Intentar de nuevo',
    },
    insufficient: {
      title: 'Saldo insuficiente',
      line: (shortfall: number) => <>A tu saldo le faltan {nim(shortfall)}.</>,
      lineUnknown: 'Tu saldo no alcanza para pagar esta cuota.',
      action: 'Intentar de nuevo',
    },
    codeNotFound: {
      title: 'Código no encontrado',
      line: 'Ese código no corresponde a ningún círculo.',
      action: 'Volver a tus círculos',
    },
    circleFull: {
      title: 'Círculo completo',
      line: (members: number) => <>Este círculo ya tiene a sus {n(members)} miembros.</>,
      action: 'Volver a tus círculos',
    },
    unreachable: {
      title: 'No pudimos conectar con Tanda',
      line: 'Tu pago no se ve afectado.',
      lineRecorded: 'Tu pago no se ve afectado y quedará registrado.',
      action: 'Reintentar',
    },
    alreadyPaid: {
      titlePaid: 'Pagado',
      titleSent: 'Enviado, esperando confirmación',
      linePaid: (name: string) => `${name} confirmó que llegó.`,
      lineSent: (name: string) => `${name} aún tiene que confirmar que llegó.`,
      action: 'Copiar hash de la transacción',
    },
  },
})

export interface I18n {
  lang: Lang
  t: Messages
  format: Format
}

export function messagesFor(lang: Lang): I18n {
  const format = formatters(lang)
  return { lang, t: lang === 'es' ? es(format) : en(format), format }
}

/**
 * The session's language: Nimiq Pay's, or `?lang=` while developing in a
 * desktop browser, where there is no host to ask.
 */
export function sessionLang(): Lang {
  if (import.meta.env.DEV) {
    const override = new URLSearchParams(location.search).get('lang')
    if (override) return resolveLang(override)
  }
  return resolveLang(hostLanguage())
}

export const I18nContext = createContext<I18n>(messagesFor('en'))

export function useI18n(): I18n {
  return useContext(I18nContext)
}
