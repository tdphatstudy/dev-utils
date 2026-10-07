import { useEffect } from 'react'
import { useAppStore } from '@renderer/store/app-store'
import { isLanguageState, LOCALES, resolveLocale, type LanguageSetting, type LocaleId, type LanguageState } from '@shared/i18n/locales'
import { translate } from '@shared/i18n/catalog'
let stateRevision = 0

function currentLocale(): LocaleId {
  const { language, systemLocale } = useAppStore.getState()
  return language === 'system' && systemLocale ? systemLocale : resolveLocale(language, typeof navigator === 'undefined' ? [] : navigator.languages)
}
/** Interface messages only. Never pass editor content or user data to this function. */
export function t(message: string, values?: Readonly<Record<string, string | number>>): string { return translate(currentLocale(), message, values) }
export function useI18n(): { t: typeof t; locale: LocaleId } {
  useAppStore(state => state.language)
  useAppStore(state => state.systemLocale)
  return { t, locale: currentLocale() }
}
function applyState(state: LanguageState): void {
  if (!isLanguageState(state)) return
  stateRevision++
  const store = useAppStore.getState()
  store.setLanguage(state.language)
  if (state.language === 'system') store.setSystemLocale(state.resolved)
}
export async function setInterfaceLanguage(language: LanguageSetting): Promise<void> {
  const revision = stateRevision
  const bridge = window.devutils?.app?.setLanguage
  if (bridge) {
    const result = await bridge(language)
    if (!isLanguageState(result)) throw new Error('Invalid language preference response.')
    // A newer tray/window event is authoritative over an older IPC response.
    if (stateRevision === revision) applyState(result)
  } else useAppStore.getState().setLanguage(language)
}
export function useLanguageSync(): void {
  const { locale } = useI18n()
  useEffect(() => {
    document.documentElement.lang = LOCALES.find(value => value.id === locale)!.intl
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr'
  }, [locale])
  useEffect(() => {
    let live = true
    let updates = 0
    const original = useAppStore.getState().language
    const unsubscribe = window.devutils?.app?.onLanguageChanged?.(state => { if (live) { updates++; applyState(state) } })
    void window.devutils?.app?.language?.().then(state => { if (live && !updates && useAppStore.getState().language === original) applyState(state) }).catch(() => { /* Browser preview/older host retains validated local preferences. */ })
    const changed = (): void => { if (useAppStore.getState().language === 'system') useAppStore.getState().setSystemLocale(resolveLocale('system', navigator.languages)) }
    window.addEventListener('languagechange', changed)
    return () => { live = false; unsubscribe?.(); window.removeEventListener('languagechange', changed) }
  }, [])
}
