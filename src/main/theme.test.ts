import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const theme = vi.hoisted(() => ({ themeSource: 'system', get shouldUseDarkColors() { return this.themeSource === 'dark' } }))
vi.mock('electron', () => ({ nativeTheme: theme }))
vi.mock('./ipc-trust', () => ({ assertTrustedIpc: () => {} }))
import { ThemePreferences } from './theme'
let directory: string
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'devfusion-theme-')) })
afterEach(async () => { await rm(directory, { recursive: true, force: true }) })
it('seeds the matching dark default and restores a saved theme while the main renderer is closed', async () => {
  const changed = vi.fn(), preferences = new ThemePreferences(directory, changed)
  await preferences.start(); expect(preferences.state()).toEqual({ theme: 'dark', configured: false, dark: true })
  await preferences.set('light'); expect(theme.themeSource).toBe('light')
  expect(changed).toHaveBeenLastCalledWith({ theme: 'light', configured: true, dark: false })
  expect(JSON.parse(await readFile(join(directory, 'theme.json'), 'utf8'))).toEqual({ version: 1, theme: 'light' })
  const restored = new ThemePreferences(directory); await restored.start(); expect(restored.state().theme).toBe('light')
})
it('serializes updates and refuses invalid values without changing the current native appearance', async () => {
  const preferences = new ThemePreferences(directory)
  await Promise.all([preferences.set('dark'), preferences.set('light'), preferences.set('system')])
  expect(theme.themeSource).toBe('system')
  for (const value of [null, {}, 'invalid']) await expect(preferences.set(value)).rejects.toThrow('supported theme')
  expect(preferences.state().theme).toBe('system')
})
it('does not apply a theme when saving fails', async () => {
  await writeFile(join(directory, 'file'), 'fixture')
  const preferences = new ThemePreferences(join(directory, 'file')); await preferences.start()
  await expect(preferences.set('light')).rejects.toThrow(); expect(theme.themeSource).toBe('dark')
})
