/**
 * §7 EmptyState: a designed state with a title, one line of explanation and an
 * action. §8.2's empty home and every §11 error state share this anatomy, so no
 * failure is ever a blank screen, an endless spinner or a raw thrown message.
 *
 * `page` fills the screen. `card` is §1's desktop card: one surface, centred in
 * a viewport that may be far wider than a phone. `inline` sits inside a sheet or
 * panel, washed in the colour that says what happened: coral when something is
 * owed or went wrong, mint when money moved.
 */
import type { ReactNode } from 'react'
import { Button } from './Button'
import { PRESS_STYLE, buttonClass } from './buttonClass'

export interface StateAction {
  label: ReactNode
  onClick?: () => void
  /** Navigation renders a real link, never a button pretending to be one. */
  href?: string
  variant?: 'primary' | 'secondary'
}

export function EmptyState({
  title,
  line,
  action,
  secondary,
  visual,
  children,
  layout = 'page',
  tone = 'coral',
}: {
  title: ReactNode
  line: ReactNode
  /** Omitted only while an action is deliberately not yet offered (§11 "retry after 8 seconds"). */
  action?: StateAction
  secondary?: StateAction
  visual?: ReactNode
  children?: ReactNode
  layout?: 'page' | 'card' | 'inline'
  tone?: 'coral' | 'mint' | 'neutral'
}) {
  if (layout === 'inline') {
    const wash = tone === 'mint' ? 'bg-mint-wash' : tone === 'coral' ? 'bg-coral-wash' : 'bg-raised'
    const ink = tone === 'mint' ? 'text-mint' : tone === 'coral' ? 'text-coral' : 'text-cream'
    return (
      <div
        role={tone === 'mint' ? 'status' : 'alert'}
        className={`rounded-[var(--radius-card)] px-4 py-3 ${wash}`}
      >
        <h2 className={`text-card text-balance ${ink}`}>{title}</h2>
        <p className="text-body text-muted text-pretty mt-0.5">{line}</p>
        {children}
        {action && <ActionButton action={action} className="mt-3" full />}
      </div>
    )
  }

  if (layout === 'card') {
    return (
      <main className="min-h-dvh bg-ground text-cream font-ui px-4 py-6 grid place-items-center">
        <div className="w-full max-w-[360px] rounded-[var(--radius-sheet)] bg-surface p-6 flex flex-col items-center text-center">
          {visual}
          <h1 className={`text-title tracking-title text-balance ${visual ? 'mt-5' : ''}`}>{title}</h1>
          <p className="text-muted text-body text-pretty mt-2">{line}</p>
          {children}
          {action && <ActionButton action={action} className="mt-5" full />}
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-dvh bg-ground text-cream font-ui px-4 py-6 max-w-[430px] mx-auto flex flex-col">
      <div className="flex flex-col items-center text-center pt-10">
        {visual}
        <h1 className={`text-title tracking-title text-balance ${visual ? 'mt-6' : ''}`}>{title}</h1>
        <p className="text-muted text-body text-pretty mt-2 max-w-[340px]">{line}</p>
        {children}
      </div>
      {(action || secondary) && (
        <div className="flex flex-col gap-3 mt-7">
          {action && <ActionButton action={action} full />}
          {secondary && <ActionButton action={{ variant: 'secondary', ...secondary }} full />}
        </div>
      )}
    </main>
  )
}

function ActionButton({
  action,
  full,
  className = '',
}: {
  action: StateAction
  full?: boolean
  className?: string
}) {
  const variant = action.variant ?? 'primary'
  if (action.href) {
    return (
      <a href={action.href} className={`${buttonClass({ variant, full })} ${className}`} style={PRESS_STYLE}>
        <span className="text-balance">{action.label}</span>
      </a>
    )
  }
  return (
    <Button variant={variant} full={full} className={className} onClick={action.onClick}>
      {action.label}
    </Button>
  )
}
