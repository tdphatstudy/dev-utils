import { nativeTheme, type IpcMain } from 'electron'
import { join } from 'node:path'
import { isThemeMode, type ThemeMode, type ThemeState } from '@shared/theme'
import { readBoundedFile } from './bounded-read'
import { atomicWriteFile } from './secret-box/atomic-write'
import { assertTrustedIpc } from './ipc-trust'

export class ThemePreferences {
  private theme: ThemeMode = 'dark'
  private configured = false
  private writes: Promise<unknown> = Promise.resolve()
  constructor(private readonly directory: string, private readonly changed: (state: ThemeState) => void = () => {}) {}
  async start(): Promise<void> {
    try {
      const raw = JSON.parse((await readBoundedFile(join(this.directory, 'theme.json'), 1024)).toString('utf8'))
      if (raw.version === 1 && isThemeMode(raw.theme)) { this.theme = raw.theme; this.configured = true }
    } catch { /* The renderer seeds the existing local preference on first use. */ }
    nativeTheme.themeSource = this.theme
  }
  state(): ThemeState { return { theme: this.theme, configured: this.configured, dark: nativeTheme.shouldUseDarkColors } }
  set(value: unknown): Promise<ThemeState> {
    if (!isThemeMode(value)) return Promise.reject(new Error('Choose a supported theme.'))
    const pending = this.writes.catch(() => {}).then(async () => {
      await atomicWriteFile(join(this.directory, 'theme.json'), JSON.stringify({ version: 1, theme: value }))
      this.theme = value; this.configured = true; nativeTheme.themeSource = value
      const state = this.state()
      try { this.changed(state) } catch { /* Closing UI must not fail a saved preference. */ }
      return state
    })
    this.writes = pending
    return pending
  }
}
export function registerThemeIpc(ipc: IpcMain, preferences: ThemePreferences): void {
  ipc.handle('app:theme', event => { assertTrustedIpc(event); return preferences.state() })
  ipc.handle('app:setTheme', (event, value: unknown) => { assertTrustedIpc(event); return preferences.set(value) })
}
