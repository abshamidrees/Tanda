/**
 * Bottom sheet. §8.6 is explicit that paying is a sheet, not a page.
 * One animation, the slide, on the single easing curve in tokens.css (§7).
 */
import { useEffect, type ReactNode } from 'react'
import { useI18n } from '../lib/i18n'

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const { t } = useI18n()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        aria-label={t.close}
        onClick={onClose}
        // No fade: §7 budgets the sheet's slide and nothing else here.
        className="absolute inset-0 bg-black/60"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-[430px] bg-surface rounded-t-[var(--radius-sheet)] pb-[max(16px,env(safe-area-inset-bottom))]"
        style={{ animation: 'sheet-in var(--dur-sheet) var(--ease) both' }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <span className="h-1 w-9 rounded-[var(--radius-chip)] bg-hairline" />
        </div>
        {children}
      </div>
    </div>
  )
}
