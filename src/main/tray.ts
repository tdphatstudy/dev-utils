import { Tray, Menu, nativeImage, clipboard, dialog, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import { randomUUID } from 'crypto'
import { APP_NAME } from '@shared/brand'
import { QUICK_TOOLS, quickTargetPath, quickWidgetForTool, type QuickTarget } from '@shared/quick-actions'
import { LOCALES, type LanguageSetting, type LanguageState } from '@shared/i18n/locales'
import { translate } from '@shared/i18n/catalog'
import { resourcePath } from './branding'
import { menuIcon } from './menu-icons'
import { electronAccelerator, type GlobalShortcutState, type QuickWidget } from '@shared/quick-tools'
import type { ClipboardState } from '@shared/clipboard/types'
import type { ScreenColorPicker } from './color-picker'
import type { DesktopOcr } from './ocr'
import type { MockApiServer } from './mock-api-server'

interface TrayPreferences {
  language: () => LanguageState
  setLanguage: (language: LanguageSetting) => Promise<unknown>
  vaultUnlocked: () => boolean
  lockVault: () => void
}
interface TrayQuickTools {
  open: (kind: QuickWidget) => Promise<void>
  clipboardState: () => ClipboardState
  pauseClipboard: (paused: boolean) => unknown
  shortcuts: () => GlobalShortcutState
}
export class DesktopTray {
  private tray: Tray | null = null
  private window: BrowserWindow | null = null
  constructor(private readonly createWindow: (route: string) => BrowserWindow, private readonly picker: ScreenColorPicker, private readonly quit: () => void, private readonly ocr?: DesktopOcr, private readonly mockApi?: MockApiServer, private readonly preferences?: TrayPreferences, private readonly quick?: TrayQuickTools) {}
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
      const path = resourcePath(process.platform === 'win32' ? 'tray.ico' : 'tray.png')
      if (!path) throw new Error('Tray icon is missing')
      const icon = nativeImage.createFromPath(path)
      if (icon.isEmpty()) throw new Error('Tray icon is invalid')
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
      const widget = quickWidgetForTool(target)
      if (widget && this.quick) { void this.quick.open(widget).catch(() => this.failure()); return }
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
    const clip = this.quick?.clipboardState(), global = this.quick?.shortcuts()
    const accelerator = (id: 'clipboard' | 'color' | 'ocr'): string | undefined => { const binding = global?.bindings[id]; return binding && global?.registered.includes(id) ? electronAccelerator(binding, global.platform) : undefined }
    const action = (run: () => unknown): (() => void) => this.action(run)
    const template: MenuItemConstructorOptions[] = [
      { label: t('Open DevFusion'), icon: menuIcon('app'), click: action(() => this.open()) },
      { label: t(busy ? 'Busy' : 'Ready'), icon: menuIcon(busy ? 'time' : 'ready'), enabled: false },
      ...(this.quick ? [{ label: `${t('Clipboard Manager')} · ${clip?.count ?? 0}`, icon: menuIcon('clipboard'), accelerator: accelerator('clipboard'), registerAccelerator: false, click: action(() => this.quick!.open('clipboard')) }] : []),
      { type: 'separator' },
      { label: t('Quick actions'), icon: menuIcon('tools'), submenu: [
        { label: t('Pick screen color…'), icon: menuIcon('pipette'), accelerator: accelerator('color'), registerAccelerator: false, enabled: !busy, click: action(() => this.quick ? this.quick.open('color') : this.picker.pickFromTray()) },
        { label: last ? `${t('Copy last color')} · ${last}` : t('Copy last color'), icon: menuIcon('copy'), enabled: !!last, click: action(() => { if (last) return clipboard.writeText(last) }) },
        { label: t('Copy new UUID'), icon: menuIcon('uuid'), click: action(() => clipboard.writeText(randomUUID())) },
        ...(this.quick ? [
          { label: t('UUID widget'), icon: menuIcon('uuid'), click: action(() => this.quick!.open('random')) },
          { label: t('Timestamp widget'), icon: menuIcon('time'), click: action(() => this.quick!.open('timestamp')) },
          { label: t('Quick text transforms'), icon: menuIcon('transform'), click: action(() => this.quick!.open('transform')) }
        ] : []),
        ...(this.ocr ? [{ label: t('Extract text (OCR)'), icon: menuIcon('ocr'), enabled: !busy, submenu: [
          { label: t('Select screen region…'), icon: menuIcon('region'), accelerator: accelerator('ocr'), registerAccelerator: false, click: action(() => this.ocr!.captureFromTray('region')) },
          { label: t('Capture current screen'), icon: menuIcon('screen'), click: action(() => this.ocr!.captureFromTray('screen')) },
          { label: 'OCR · Image / PDF', icon: menuIcon('ocr'), click: action(() => this.open('text.ocr')) }
        ] }] : [])
      ] },
      ...(this.mockApi ? [{ label: mock?.running ? `Mock API · ${mock.port}` : `Mock API · ${t('Stopped')}`, icon: menuIcon('server'), submenu: [
        { label: 'Mock API', icon: menuIcon('server'), click: action(() => this.open('network.mock-api')) },
        { label: t('Copy base URL'), icon: menuIcon('copy'), enabled: !!mock?.baseUrl, click: action(() => { if (mock?.baseUrl) return clipboard.writeText(mock.baseUrl) }) },
        { label: t('Stop server'), icon: menuIcon('stop'), enabled: !!mock?.running, click: action(() => this.mockApi!.stop()) }
      ] }] : []),
      { label: t('Open tool'), icon: menuIcon('tools'), submenu: QUICK_TOOLS.map(tool => ({ label: t(tool.name), icon: menuIcon(({ 'design.color': 'pipette', 'text.ocr': 'ocr', 'text.clipboard': 'clipboard', 'network.mock-api': 'server', 'time.timestamp': 'time', 'json.studio': 'json', 'base64.codec': 'transform', 'security.random': 'uuid', 'text.qr': 'qr' })[tool.id]), click: action(() => this.open(tool.id)) })) },
      { type: 'separator' },
      ...(this.quick ? [{ label: t(clip?.paused ? 'Resume clipboard capture' : 'Pause clipboard capture'), icon: menuIcon(clip?.paused ? 'play' : 'pause'), enabled: !!clip?.preferences.enabled && !clip.blocked, click: action(() => this.quick!.pauseClipboard(!clip?.paused)) }] : []),
      { label: t('Settings'), icon: menuIcon('settings'), click: action(() => this.open('app.settings')) },
      ...(this.preferences ? [
        { label: t('Language'), icon: menuIcon('language'), submenu: [
          { label: t('Follow system'), type: 'radio' as const, checked: language?.language === 'system', click: action(() => this.preferences!.setLanguage('system')) },
          { type: 'separator' as const },
          ...LOCALES.map(locale => ({ label: locale.name, type: 'radio' as const, checked: language?.language === locale.id, click: action(() => this.preferences!.setLanguage(locale.id)) }))
        ] },
        { label: t('Lock Private Box'), icon: menuIcon('lock'), enabled: this.preferences.vaultUnlocked(), click: action(() => this.preferences!.lockVault()) }
      ] : []),
      { type: 'separator' },
      { label: t('Quit DevFusion'), icon: menuIcon('quit'), click: action(this.quit) }
    ]
    this.tray!.setContextMenu(Menu.buildFromTemplate(template))
  }
  dispose(): void {
    for (const dispose of [() => this.picker.dispose(), () => this.ocr?.dispose(), () => this.tray?.destroy()]) { try { dispose() } catch { /* Complete remaining cleanup. */ } }
    this.tray = null
  }
}
