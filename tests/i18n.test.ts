import { describe, expect, it } from 'vitest'
import { LOCALES, isLanguage, isLanguageState, resolveLocale } from '../src/shared/i18n/locales'
import { messageKeys, messages, translate, TRANSLATION_LOCALES } from '../src/shared/i18n/catalog'
import { readAppPreferences } from '../src/renderer/src/store/app-preferences'

describe('local interface languages', () => {
  it('supports 13 unique languages, locale variants and a deterministic English fallback', () => {
    expect(LOCALES).toHaveLength(13)
    expect(new Set(LOCALES.map(locale => locale.id)).size).toBe(13)
    expect(resolveLocale('system', ['unsupported', 'vi_VN'])).toBe('vi')
    expect(resolveLocale('system', ['zh-TW'])).toBe('zh')
    expect(resolveLocale('fr', ['vi-VN'])).toBe('fr')
    expect(resolveLocale('system', ['unsupported'])).toBe('en')
    expect(LOCALES.filter(locale => locale.direction === 'rtl').map(locale => locale.id)).toEqual(['ar'])
  })
  it('rejects untrusted settings instead of accepting payloads or coercions', () => {
    for (const value of [null, {}, [], false, 'constructor', '<script>', 'vi-VN', 1]) {
      expect(isLanguage(value)).toBe(false)
      expect(readAppPreferences({ language: value })).toEqual({})
    }
    expect(isLanguageState({ language: 'vi', resolved: 'vi' })).toBe(true)
    expect(isLanguageState({ language: 'vi', resolved: {} })).toBe(false)
    expect(readAppPreferences({ language: 'vi', systemLocale: 'vi', content: 'private' })).toEqual({ language: 'vi' })
  })
  it('has complete translations and identical variable contracts for each catalog message', () => {
    expect(messageKeys.length).toBeGreaterThan(240)
    expect(new Set(messageKeys).size).toBe(messageKeys.length)
    const placeholders = (value: string): string[] => [...value.matchAll(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g)].map(match => match[1]).sort()
    for (const key of messageKeys) for (const locale of TRANSLATION_LOCALES) {
      const value = messages[key][locale]
      expect(value, `${locale}: ${key}`).toBeTypeOf('string')
      expect(value?.trim().length, `${locale}: ${key}`).toBeGreaterThan(0)
      expect(placeholders(value!), `${locale}: ${key}`).toEqual(placeholders(key))
    }
  })
  it('falls back for unknown interface messages and substitutes values without recursively translating them', () => {
    expect(translate('vi', 'Settings')).toBe('Cài đặt')
    expect(translate('vi', 'untranslated technical diagnostic')).toBe('untranslated technical diagnostic')
    expect(translate('vi', 'constructor')).toBe('constructor')
    expect(translate('vi', 'Opening {tool}…', { tool: '{other} <code> Home' })).toBe('Đang mở {other} <code> Home…')
    expect(translate('en', '{count} tools', { count: 1 })).toBe('1 tools')
  })
})
