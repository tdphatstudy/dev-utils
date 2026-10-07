import { Tray, Menu, nativeImage, clipboard, dialog, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import { randomUUID } from 'crypto'
import { APP_NAME } from '@shared/brand'
import { QUICK_TOOLS, quickTargetPath, type QuickTarget } from '@shared/quick-actions'
import { LOCALES, type LanguageSetting, type LanguageState } from '@shared/i18n/locales'
import { translate } from '@shared/i18n/catalog'
import { resourcePath } from './branding'
import type { ScreenColorPicker } from './color-picker'
import type { DesktopOcr } from './ocr'
import type { MockApiServer } from './mock-api-server'

interface TrayPreferences {
  language: () => LanguageState
  setLanguage: (language: LanguageSetting) => Promise<unknown>
  vaultUnlocked: () => boolean
  lockVault: () => void
}
export class DesktopTray {
  private tray: Tray | null = null
  private window: BrowserWindow | null = null
  constructor(private readonly createWindow: (route: string) => BrowserWindow, private readonly picker: ScreenColorPicker, private readonly quit: () => void, private readonly ocr?: DesktopOcr, private readonly mockApi?: MockApiServer, private readonly preferences?: TrayPreferences) {}
  private text(message: string): string { return translate(this.preferences?.language().resolved ?? 'en', message) }
  private failure(): void {
    try { void dialog.showMessageBox({ type: 'warning', title: APP_NAME, message: this.text('This action could not be completed. Open the matching tool and retry.') }).catch(() => {}) } catch { /* Native UI may already be shutting down. */ }
  }
  /** Capture both synchronous native failures and rejected async actions. */
  private action(run: () => unknown): () => void {
    return () => { try { void Promise.resolve(run()).catch(() => this.failure()) } catch { this.failure() } }
  }
  start(): boolean {
    if (this.hasTray()) return true
    try {
      const path = resourcePath(process.platform === 'darwin' ? 'trayTemplate.png' : process.platform === 'win32' ? 'tray.ico' : 'tray.png')
      if (!path) throw new Error('Tray icon is missing')
      const icon = nativeImage.createFromPath(path)
      if (icon.isEmpty()) throw new Error('Tray icon is invalid')
      if (process.platform === 'darwin') icon.setTemplateImage(true)
      this.tray = new Tray(icon)
      this.tray.setToolTip(APP_NAME)
      this.buildMenu()
      if (process.platform === 'win32') this.tray.on('click', this.action(() => this.tray?.popUpContextMenu()))
      this.tray.on('double-click', this.action(() => this.open()))
      return true
    } catch {
      try { this.tray?.destroy() } catch { /* Already disposed. */ }
      this.tray = null
      console.warn('[DevFusion] Tray unavailable; closing the last window will exit normally.')
      return false
    }
  }
  hasTray(): boolean { try { return this.tray !== null && !this.tray.isDestroyed() } catch { return false } }
  notifyColor(hex: string): void {
    try { if (this.window && !this.window.isDestroyed()) this.window.webContents.send('color:picked', hex) } catch { /* A closing renderer cannot receive events. */ }
  }
  open(target?: QuickTarget): void {
    try {
      const route = quickTargetPath(target ?? 'home')
      if (!this.window || this.window.isDestroyed()) {
        const win = this.createWindow(route)
        this.window = win
        win.once('closed', () => { if (this.window === win) this.window = null })
        return
      }
      const win = this.window
      if (win.isMinimized()) win.restore()
      win.show(); win.focus()
      if (!target) return
      const navigate = (): void => {
        try { if (!win.isDestroyed()) win.webContents.send('app:openTool', target) } catch { /* Closing window. */ }
      }
      if (win.webContents.isLoading()) win.webContents.once('did-finish-load', navigate)
      else navigate()
    } catch { this.failure() }
  }
  refresh(): void {
    try { if (this.hasTray()) this.buildMenu() } catch { /* Keep the last working menu during shutdown. */ }
  }
  private buildMenu(): void {
    const t = (message: string): string => this.text(message)
    const last = this.picker.getLast(), mock = this.mockApi?.status()
    const busy = this.picker.isBusy() || !!this.ocr?.isBusy()
    const language = this.preferences?.language()
    const action = (run: () => unknown): (() => void) => this.action(run)
    const template: MenuItemConstructorOptions[] = [
      { label: t('Open DevFusion'), click: action(() => this.open()) },
      { label: t(busy ? 'Busy' : 'Ready'), enabled: false },
      { type: 'separator' },
      { label: t('Quick actions'), submenu: [
        { label: t('Pick screen color…'), enabled: !busy, click: action(() => this.picker.pickFromTray()) },
        { label: last ? `${t('Copy last color')} · ${last}` : t('Copy last color'), enabled: !!last, click: action(() => { if (last) return clipboard.writeText(last) }) },
        { label: t('Copy new UUID'), click: action(() => clipboard.writeText(randomUUID())) },
        ...(this.ocr ? [{ label: t('Extract text (OCR)'), enabled: !busy, submenu: [
          { label: t('Select screen region…'), click: action(() => this.ocr!.captureFromTray('region')) },
          { label: t('Capture current screen'), click: action(() => this.ocr!.captureFromTray('screen')) },
          { label: 'OCR · Image / PDF', click: action(() => this.open('text.ocr')) }
        ] }] : [])
      ] },
      ...(this.mockApi ? [{ label: mock?.running ? `Mock API · ${mock.port}` : `Mock API · ${t('Stopped')}`, submenu: [
        { label: 'Mock API', click: action(() => this.open('network.mock-api')) },
        { label: t('Copy base URL'), enabled: !!mock?.baseUrl, click: action(() => { if (mock?.baseUrl) return clipboard.writeText(mock.baseUrl) }) },
        { label: t('Stop server'), enabled: !!mock?.running, click: action(() => this.mockApi!.stop()) }
      ] }] : []),
      { label: t('Open tool'), submenu: QUICK_TOOLS.map(tool => ({ label: t(tool.name), click: action(() => this.open(tool.id)) })) },
      { type: 'separator' },
      { label: t('Settings'), click: action(() => this.open('app.settings')) },
      ...(this.preferences ? [
        { label: t('Language'), submenu: [
          { label: t('Follow system'), type: 'radio' as const, checked: language?.language === 'system', click: action(() => this.preferences!.setLanguage('system')) },
          { type: 'separator' as const },
          ...LOCALES.map(locale => ({ label: locale.name, type: 'radio' as const, checked: language?.language === locale.id, click: action(() => this.preferences!.setLanguage(locale.id)) }))
        ] },
        { label: t('Lock Private Box'), enabled: this.preferences.vaultUnlocked(), click: action(() => this.preferences!.lockVault()) }
      ] : []),
      { type: 'separator' },
      { label: t('Quit DevFusion'), click: action(this.quit) }
    ]
    this.tray!.setContextMenu(Menu.buildFromTemplate(template))
  }
  dispose(): void {
    for (const dispose of [() => this.picker.dispose(), () => this.ocr?.dispose(), () => this.tray?.destroy()]) { try { dispose() } catch { /* Complete remaining cleanup. */ } }
    this.tray = null
  }
}
