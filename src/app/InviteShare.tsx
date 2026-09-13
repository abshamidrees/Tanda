/**
 * The invite, once a circle exists (§8.3, and §8.8's "start another").
 *
 * The code is the part that has to survive. It goes out as plain text inside
 * every share, because Nimiq documents the deeplink format but not whether a
 * `?join=` parameter reaches the mini app — so a member can always type it.
 * The native share sheet is used where the WebView has one; otherwise the same
 * message is copied.
 */
import { Button } from '../components/Button'
import { PRESS_STYLE, buttonClass } from '../components/buttonClass'
import { Toast } from '../components/Toast'
import { copyText } from '../lib/clipboard'
import { useI18n } from '../lib/i18n'
import { link } from '../lib/identity'
import { breakableUrl, deeplink } from '../lib/links'
import { useToast } from '../lib/useToast'

export function InviteShare({
  name,
  code,
  showOpen = true,
}: {
  name: string
  code: string
  /** Off on the circle screen itself, where opening the circle would be a link to here. */
  showOpen?: boolean
}) {
  const { t } = useI18n()
  const toast = useToast()
  const invite = deeplink({ join: code })
  const message = t.invite.message(name, code, invite)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  async function share() {
    if (canShare) {
      try {
        await navigator.share({ text: message })
        return
      } catch (error) {
        // Dismissing the sheet is a choice, not a failure.
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }
    if (await copyText(message)) toast.show(t.copied)
  }

  return (
    <>
      <p className="label">{t.invite.label}</p>
      <p className="num text-pot tracking-pot text-cream mt-2">{code}</p>
      <p className="num text-body text-muted mt-2 break-words">{breakableUrl(invite)}</p>
      <Button full className="mt-5" onClick={share}>
        {canShare ? t.invite.share : t.invite.copy}
      </Button>
      {showOpen && (
        <a
          href={link({ code })}
          className={`${buttonClass({ variant: 'secondary', full: true })} mt-3`}
          style={PRESS_STYLE}
        >
          <span className="text-balance">{t.invite.open}</span>
        </a>
      )}
      <Toast message={toast.message} id={toast.key} />
    </>
  )
}
