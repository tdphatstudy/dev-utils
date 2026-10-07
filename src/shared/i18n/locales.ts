export const LOCALES = [
  { id: 'en', name: 'English', intl: 'en', direction: 'ltr' },
  { id: 'zh', name: '简体中文', intl: 'zh-Hans', direction: 'ltr' },
  { id: 'es', name: 'Español', intl: 'es', direction: 'ltr' },
  { id: 'fr', name: 'Français', intl: 'fr', direction: 'ltr' },
  { id: 'de', name: 'Deutsch', intl: 'de', direction: 'ltr' },
  { id: 'ja', name: '日本語', intl: 'ja', direction: 'ltr' },
  { id: 'ko', name: '한국어', intl: 'ko', direction: 'ltr' },
  { id: 'pt', name: 'Português', intl: 'pt', direction: 'ltr' },
  { id: 'ru', name: 'Русский', intl: 'ru', direction: 'ltr' },
  { id: 'ar', name: 'العربية', intl: 'ar', direction: 'rtl' },
  { id: 'hi', name: 'हिन्दी', intl: 'hi', direction: 'ltr' },
  { id: 'id', name: 'Bahasa Indonesia', intl: 'id', direction: 'ltr' },
  { id: 'vi', name: 'Tiếng Việt', intl: 'vi', direction: 'ltr' }
] as const
export type LocaleId = typeof LOCALES[number]['id']
export type LanguageSetting = LocaleId | 'system'
export interface LanguageState { language: LanguageSetting; resolved: LocaleId }
export function isLocale(value: unknown): value is LocaleId { return typeof value === 'string' && LOCALES.some(locale => locale.id === value) }
export function isLanguage(value: unknown): value is LanguageSetting { return value === 'system' || isLocale(value) }
export function isLanguageState(value: unknown): value is LanguageState {
  if (!value || typeof value !== 'object') return false
  const state = value as LanguageState
  return isLanguage(state.language) && isLocale(state.resolved)
}
export function resolveLocale(setting: LanguageSetting, preferred: readonly string[] = []): LocaleId {
  if (isLocale(setting)) return setting
  for (const language of preferred.slice(0, 20)) {
    if (typeof language !== 'string') continue
    const base = language.toLowerCase().replace('_', '-').split('-')[0]
    if (isLocale(base)) return base
  }
  return 'en'
}
