/**
 * §7 Button. Gold is the primary fill: §4 allows gold for whose turn it is
 * and for primary buttons, nothing else. Press is the only animation: scale to
 * 0.97 over 100ms on the one curve.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { PRESS_STYLE, buttonClass, type Size, type Variant } from './buttonClass'

export function Button({
  variant = 'primary',
  size = 'default',
  full = false,
  children,
  className = '',
  ...rest
}: {
  variant?: Variant
  size?: Size
  full?: boolean
  children: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`${buttonClass({ variant, size, full })} ${className}`}
      style={{ ...PRESS_STYLE, ...rest.style }}
    >
      {/* One inline run: as direct flex items, text and a mono span lose the space between them. */}
      <span className="text-balance">{children}</span>
    </button>
  )
}
