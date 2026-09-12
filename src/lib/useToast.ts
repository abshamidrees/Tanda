/** State for §7's toast: show a message, and it clears itself. */
import { useCallback, useEffect, useRef, useState } from 'react'

const VISIBLE_MS = 1_800

export function useToast() {
  const [message, setMessage] = useState<string | null>(null)
  // Each show gets a fresh key, so a repeat toast replays its entrance.
  const [key, setKey] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const show = useCallback((text: string) => {
    clearTimeout(timer.current)
    setMessage(text)
    setKey((k) => k + 1)
    timer.current = setTimeout(() => setMessage(null), VISIBLE_MS)
  }, [])

  useEffect(() => () => clearTimeout(timer.current), [])

  return { message, key, show }
}
