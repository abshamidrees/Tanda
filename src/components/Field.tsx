/**
 * §7 Field, the ninth and last component. A labelled input on `raised` (§4:
 * inputs), one hairline, the field radius. Amounts and codes set `mono`.
 * An error turns the hairline coral, which §4 allows for errors and nothing else.
 */
import { useId, type InputHTMLAttributes, type ReactNode } from 'react'

export function Field({
  label,
  hint,
  error,
  suffix,
  mono = false,
  className = '',
  ...input
}: {
  label: string
  hint?: ReactNode
  error?: ReactNode
  /** Unit after the value, e.g. NIM. */
  suffix?: ReactNode
  mono?: boolean
} & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  const note = error ? `${id}-error` : hint ? `${id}-hint` : undefined

  return (
    <div className={className}>
      <label htmlFor={id} className="label block mb-2">
        {label}
      </label>
      <div
        className={`flex items-center rounded-[var(--radius-field)] bg-raised border ${
          error ? 'border-coral' : 'border-hairline focus-within:border-muted'
        }`}
      >
        <input
          {...input}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={note}
          className={`min-h-[52px] w-full min-w-0 bg-transparent px-4 text-card text-cream placeholder:text-muted outline-none ${
            mono ? 'num' : ''
          }`}
        />
        {suffix && <span className="label pr-4 shrink-0">{suffix}</span>}
      </div>
      {error ? (
        <p id={note} className="text-body text-coral mt-1">
          {error}
        </p>
      ) : hint ? (
        <p id={note} className="text-body text-muted mt-1">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
