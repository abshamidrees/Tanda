/** Button styling, shared so an `<a>` that navigates can look exactly like a button. */

export type Variant = 'primary' | 'secondary'
export type Size = 'default' | 'compact'

/** Compact is for an action inside a row. 44px is still a full tap target. */
const SIZE: Record<Size, string> = {
  // py-2 lets a label that must wrap (Spanish runs long) take two lines and still breathe.
  default: 'min-h-[52px] px-4 py-2 text-card',
  compact: 'min-h-[44px] px-3 text-body',
}

const VARIANT: Record<Variant, string> = {
  primary: 'bg-gold text-ground font-semibold',
  secondary: 'bg-raised text-cream',
}

/** The same look for an `<a>` that navigates, so links never pose as buttons. */
export function buttonClass({
  variant = 'primary',
  size = 'default',
  full = false,
}: { variant?: Variant; size?: Size; full?: boolean } = {}) {
  return `inline-flex items-center justify-center rounded-[var(--radius-field)] disabled:opacity-60
          active:scale-[0.97] ${SIZE[size]} ${full ? 'w-full' : ''} ${VARIANT[variant]}`
}

export const PRESS_STYLE = {
  transitionProperty: 'transform',
  transitionDuration: 'var(--dur-press)',
  transitionTimingFunction: 'var(--ease)',
} as const
