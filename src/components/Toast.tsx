/**
 * §7 Toast: fade and rise 8px over 180ms. The confirmation for small actions
 * with no visible result of their own, like copying a hash or a link.
 */
export function Toast({ message, id }: { message: string | null; id: number }) {
  return (
    <div
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center pointer-events-none pb-[max(24px,env(safe-area-inset-bottom))]"
    >
      {message && (
        <p
          key={id}
          role="status"
          className="rounded-[var(--radius-chip)] bg-raised text-cream text-body px-4 py-2"
          style={{ animation: 'toast-in var(--dur-toast) var(--ease) both' }}
        >
          {message}
        </p>
      )}
    </div>
  )
}
