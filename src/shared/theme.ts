export type ThemeMode = 'dark' | 'light' | 'system'
export interface ThemeState { theme: ThemeMode; configured: boolean; dark: boolean }
export function isThemeMode(value: unknown): value is ThemeMode { return value === 'dark' || value === 'light' || value === 'system' }
export function isThemeState(value: unknown): value is ThemeState {
  const state = value as ThemeState | null
  return !!state && isThemeMode(state.theme) && typeof state.configured === 'boolean' && typeof state.dark === 'boolean'
}
