import type { ReactNode } from 'react'

/**
 * The Nimiq Pay deeplink (§10). A circle spreads through a WhatsApp group, so
 * this is how people arrive: `…/miniapps/open/<domain>?join=CODE`.
 */
export function deeplink(params: Record<string, string> = {}): string {
  const query = new URLSearchParams(params).toString()
  return `https://nimpay.app/miniapps/open/${location.host}${query ? `?${query}` : ''}`
}

/** A URL that wraps after its slashes, never inside a word. */
export function breakableUrl(url: string): ReactNode {
  const parts = url.split('/')
  return parts.map((part, i) => (
    <span key={i}>
      {part}
      {i < parts.length - 1 && (
        <>
          /<wbr />
        </>
      )}
    </span>
  ))
}
