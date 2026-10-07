import { join } from 'node:path'
import type { IpcMain } from 'electron'
import { isLanguage, resolveLocale, type LanguageSetting, type LanguageState } from '@shared/i18n/locales'
import { readBoundedFile } from './bounded-read'
import { atomicWriteFile } from './secret-box/atomic-write'
import { assertTrustedIpc } from './ipc-trust'

export class LanguagePreferences {
  private language: LanguageSetting = 'system'
  private writes: Promise<unknown> = Promise.resolve()
  constructor(private readonly directory: string, private readonly systemLanguages: () => readonly string[], private readonly changed: (state: LanguageState) => void = () => {}) {}
  async start(): Promise<void> {
    try {
      const raw = JSON.parse((await readBoundedFile(join(this.directory, 'language.json'), 1024)).toString('utf8'))
      if (raw.version === 1 && isLanguage(raw.language)) this.language = raw.language
    } catch { /* Missing/corrupt non-sensitive preferences use System. */ }
  }
  state(): LanguageState { return { language: this.language, resolved: resolveLocale(this.language, this.systemLanguages()) } }
  async set(value: unknown): Promise<LanguageState> {
    if (!isLanguage(value)) throw new Error('Choose a supported interface language.')
    const pending = this.writes.catch(() => {}).then(async () => {
      await atomicWriteFile(join(this.directory, 'language.json'), JSON.stringify({ version: 1, language: value }))
      this.language = value
      const state = this.state()
      try { this.changed(state) } catch { /* A closing window must not fail a saved preference. */ }
      return state
    })
    this.writes = pending
    return pending
  }
}
export function registerLanguageIpc(ipc: IpcMain, preferences: LanguagePreferences): void {
  ipc.handle('app:language', event => { assertTrustedIpc(event); return preferences.state() })
  ipc.handle('app:setLanguage', (event, value: unknown) => { assertTrustedIpc(event); return preferences.set(value) })
}
