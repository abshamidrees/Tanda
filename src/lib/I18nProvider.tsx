/** Hands the session's language to every screen (lib/i18n.tsx). */
import { useMemo, type ReactNode } from 'react'
import { I18nContext, messagesFor, type Lang } from './i18n'

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const value = useMemo(() => messagesFor(lang), [lang])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
