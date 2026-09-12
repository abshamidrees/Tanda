/**
 * Copy text on any origin. Nimiq Pay loads local mini apps over plain HTTP,
 * where the async Clipboard API does not exist (docs/DAY-ONE.md), so fall back
 * to the selection-based copy that still works there.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (window.isSecureContext && navigator.clipboard) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Permission denied or unavailable: try the fallback.
  }

  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  Object.assign(area.style, { position: 'fixed', top: '0', opacity: '0' })
  document.body.appendChild(area)
  area.select()
  let copied = false
  try {
    copied = document.execCommand('copy')
  } catch {
    copied = false
  }
  area.remove()
  return copied
}
