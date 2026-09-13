/**
 * Every word the user reads, in English and Spanish (§10).
 *
 * The language is Nimiq Pay's `window.nimiqPay.language`, read through
 * lib/nimiq.ts, never `navigator.language`. It is static for the session, so
 * it is resolved once at the root and handed down through context.
 *
 * Spanish matters here beyond coverage: *tanda* is the Latin American word for
 * this whole practice. Word choices keep §2's rule in Spanish too: no "pozo"
 * (its everyday sense is a numbers-game carry-over), no "bote", no "sorteo",
 * no "ganar". The pot is "bolsa".
 */
import { createContext, useContext, type ReactNode } from 'react'
import { hostLanguage } from './nimiq'

export type Lang = 'en' | 'es'

export function resolveLang(code: string | null | undefined): Lang {
  return code?.toLowerCase().startsWith('es') ? 'es' : 'en'
}

/**
 * The host sends a bare ISO 639-1 code. Plain `es` formats the Spain way
 * (measured: 3000 renders "3000" and 60000 renders "60.000"), while `es-419`
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
  identityReason: 'So Tanda can remember which circles this device belongs to, and not show the introduction twice.',
  footer: 'Tanda never holds your money. Payments go wallet to wallet through Nimiq Pay.',

  word: {
    pot: 'Pot',
    share: 'Share',
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
  /** The stat strip's due date while seats are still open. */
  dueWhenFull: 'when full',

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

  /** §8.1, first open only. The custody card is §2's sentence, verbatim. */
  onboarding: {
    label: 'Introduction',
    step: (n: number, total: number) => `${n} of ${total}`,
    ringTitle: 'Six friends. Everyone pays in.',
    ringLine: 'One person takes the pot. The turn rotates until everyone has had one.',
    custodyTitle: 'Tanda never holds your money.',
    custodyLine:
      "Every share is a direct payment from your wallet to another member's, through Nimiq Pay. Tanda is the schedule, the record and the reminder.",
    startTitle: 'Start a circle, or join one with a code.',
    next: 'Next',
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
        Waiting on {n(count)} {plural(count, 'member', 'members')}. Only you can confirm:
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
    checking: 'Checking for your payment…',
    explain: (name: string) =>
      `This opens Nimiq Pay. The payment goes straight to ${name}. Tanda never holds your money.`,
    walletTitle: 'Payment not sent',
    walletFailed: 'No payment for this share has reached the chain. Check your wallet before trying again.',
    alreadySettled: 'This share is already settled.',
    savedOnDevice: (hash: string) => `${hash.slice(0, 16)}… saved on this device`,
  },

  closing: {
    /** §8.8, told the way the wallet saw it: what left, and what was offset. */
    youSent: 'You sent',
    ownShare: 'Your own share',
    ownShareNote: 'offset against your pot',
    youContributed: 'You contributed',
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
  },

  /** §8.3 */
  create: {
    title: 'Start a circle',
    name: 'Circle name',
    share: 'Share per round',
    frequency: 'How often',
    members: 'Members',
    fewer: 'One fewer member',
    more: 'One more member',
    range: (min: number, max: number) => (
      <>
        {n(min)} to {n(max)} members
      </>
    ),
    yourName: 'Your name',
    yourNameHint: 'How the group will see you.',
    needName: 'Give the circle a name.',
    needShare: 'Enter a share above zero.',
    needYourName: 'Add your name.',
    submit: 'Create circle',
    creating: 'Creating…',
  },

  /** §8.4 */
  join: {
    title: 'Join a circle',
    code: 'Invite code',
    codeHint: 'Six letters and numbers, from whoever invited you.',
    find: 'Find circle',
    finding: 'Looking…',
    seats: (joined: number, total: number) => (
      <>
        {n(joined)} of {n(total)} joined
      </>
    ),
    rotation: 'Rotation order',
    openSeat: 'Open seat',
    yourTurn: (round: number, total: number) => (
      <>
        You would be up in round {n(round)} of {n(total)}
      </>
    ),
    /** When that round opens: whole periods after the circle starts, which is when it fills. */
    when: (periods: number, frequency: 'weekly' | 'monthly'): ReactNode =>
      periods === 0 ? (
        'As soon as the circle starts'
      ) : (
        <>
          About {n(periods)}{' '}
          {frequency === 'weekly' ? plural(periods, 'week', 'weeks') : plural(periods, 'month', 'months')}{' '}
          after it starts
        </>
      ),
    startsWhenFull: (remaining: number): ReactNode =>
      remaining === 1 ? (
        'The circle starts as soon as you join.'
      ) : (
        <>It starts when {n(remaining)} more join, you included.</>
      ),
    submit: 'Join circle',
    joining: 'Joining…',
    another: 'Try another code',
  },

  invite: {
    title: 'Your circle is ready',
    label: 'Share this code with the group',
    share: 'Share invite',
    copy: 'Copy invite',
    open: 'Open the circle',
    /** The code travels as plain text too: Nimiq does not document that ?join= survives the deeplink. */
    message: (name: string, code: string, link: string) =>
      `Join ${name} on Tanda with code ${code}. Open it in Nimiq Pay: ${link}`,
  },

  wallet: {
    addressTitle: 'Tanda needs your address',
    addressLine: 'Members pay you at this address, so Nimiq Pay asks before sharing it.',
    addressAction: 'Try again',
  },

  /** §21 data disclosure, shown where the data is first stored. */
  disclosure:
    'Tanda stores the circle, your name, your Nimiq address and a device identifier from Nimiq Pay. It never holds your money.',

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
      /** Anywhere no payment is in flight: home, a circle, creating a circle. */
      line: 'Check your connection and try again.',
      /** §11's own line. Only inside the pay sheet, where there is a payment for it to be about. */
      linePayment: 'Your payment is unaffected.',
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
  identityReason: 'Para que Tanda recuerde a qué círculos pertenece este dispositivo y no muestre la introducción dos veces.',
  footer: 'Tanda nunca guarda tu dinero. Los pagos van de billetera a billetera a través de Nimiq Pay.',

  word: {
    pot: 'Bolsa',
    share: 'Cuota',
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
  dueWhenFull: 'al llenarse',

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

  onboarding: {
    label: 'Introducción',
    step: (n: number, total: number) => `${n} de ${total}`,
    ringTitle: 'Seis amigos. Todos aportan.',
    ringLine: 'Una persona recibe la bolsa. El turno rota hasta que a todos les toque.',
    custodyTitle: 'Tanda nunca guarda tu dinero.',
    custodyLine:
      'Cada cuota es un pago directo de tu billetera a la de otro miembro, a través de Nimiq Pay. Tanda es el calendario, el registro y el recordatorio.',
    startTitle: 'Empieza un círculo o únete a uno con un código.',
    next: 'Siguiente',
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
    checking: 'Buscando tu pago…',
    explain: (name: string) =>
      `Se abrirá Nimiq Pay. El pago va directo a ${name}. Tanda nunca guarda tu dinero.`,
    walletTitle: 'Pago no enviado',
    walletFailed: 'Ningún pago de esta cuota llegó a la blockchain. Revisa tu billetera antes de intentarlo de nuevo.',
    alreadySettled: 'Esta cuota ya está saldada.',
    savedOnDevice: (hash: string) => `${hash.slice(0, 16)}… guardado en este dispositivo`,
  },

  closing: {
    youSent: 'Enviaste',
    ownShare: 'Tu propia cuota',
    ownShareNote: 'se compensa con tu bolsa',
    youContributed: 'Aportaste',
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
  },

  create: {
    title: 'Empezar un círculo',
    name: 'Nombre del círculo',
    share: 'Cuota por ronda',
    frequency: 'Cada cuánto',
    members: 'Miembros',
    fewer: 'Un miembro menos',
    more: 'Un miembro más',
    range: (min: number, max: number) => (
      <>
        De {n(min)} a {n(max)} miembros
      </>
    ),
    yourName: 'Tu nombre',
    yourNameHint: 'Así te verá el grupo.',
    needName: 'Ponle un nombre al círculo.',
    needShare: 'Escribe una cuota mayor que cero.',
    needYourName: 'Agrega tu nombre.',
    submit: 'Crear círculo',
    creating: 'Creando…',
  },

  join: {
    title: 'Unirse a un círculo',
    code: 'Código de invitación',
    codeHint: 'Seis letras y números, de quien te invitó.',
    find: 'Buscar círculo',
    finding: 'Buscando…',
    seats: (joined: number, total: number) => (
      <>
        {n(joined)} de {n(total)} ya se unieron
      </>
    ),
    rotation: 'Orden de turnos',
    openSeat: 'Lugar libre',
    yourTurn: (round: number, total: number) => (
      <>
        Te tocaría en la ronda {n(round)} de {n(total)}
      </>
    ),
    when: (periods: number, frequency: 'weekly' | 'monthly') =>
      periods === 0 ? (
        'En cuanto empiece el círculo'
      ) : periods === 1 ? (
        frequency === 'weekly' ? 'Una semana después de que empiece' : 'Un mes después de que empiece'
      ) : (
        <>
          Unas {n(periods)} {frequency === 'weekly' ? 'semanas' : 'meses'} después de que empiece
        </>
      ),
    startsWhenFull: (remaining: number) =>
      remaining === 1 ? (
        'El círculo empieza en cuanto te unas.'
      ) : (
        <>Empieza cuando se unan {n(remaining)} más, contándote a ti.</>
      ),
    submit: 'Unirme al círculo',
    joining: 'Uniéndote…',
    another: 'Probar otro código',
  },

  invite: {
    title: 'Tu círculo está listo',
    label: 'Comparte este código con el grupo',
    share: 'Compartir invitación',
    copy: 'Copiar invitación',
    open: 'Abrir el círculo',
    message: (name: string, code: string, link: string) =>
      `Únete a ${name} en Tanda con el código ${code}. Ábrelo en Nimiq Pay: ${link}`,
  },

  wallet: {
    addressTitle: 'Tanda necesita tu dirección',
    addressLine: 'Los miembros te pagan a esta dirección, así que Nimiq Pay te pregunta antes de compartirla.',
    addressAction: 'Reintentar',
  },

  disclosure:
    'Tanda registra el círculo, tu nombre, tu dirección de Nimiq y un identificador de dispositivo de Nimiq Pay. Nunca guarda tu dinero.',

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
      line: 'Revisa tu conexión e inténtalo de nuevo.',
      linePayment: 'Tu pago no se ve afectado.',
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
