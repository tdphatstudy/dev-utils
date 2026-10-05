import { Tray, Menu, nativeImage, clipboard, dialog, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import { randomUUID } from 'crypto'
import { APP_NAME } from '@shared/brand'
import { QUICK_TOOLS, quickTargetPath, type QuickTarget } from '@shared/quick-actions'
import { resourcePath } from './branding'
import type { ScreenColorPicker } from './color-picker'
import type { DesktopOcr } from './ocr'
import type { MockApiServer } from './mock-api-server'

export class DesktopTray {
  private tray: Tray | null = null
  private window: BrowserWindow | null = null
  constructor(private readonly createWindow: (route: string) => BrowserWindow, private readonly picker: ScreenColorPicker, private readonly quit: () => void, private readonly ocr?: DesktopOcr, private readonly mockApi?: MockApiServer) {}

  start(): boolean {
    try {
      const path = resourcePath(process.platform === 'darwin' ? 'trayTemplate.png' : process.platform === 'win32' ? 'tray.ico' : 'tray.png')
      if (!path) throw new Error('Tray icon is missing')
      const icon = nativeImage.createFromPath(path)
      if (icon.isEmpty()) throw new Error('Tray icon is invalid')
      if (process.platform === 'darwin') icon.setTemplateImage(true)
      this.tray = new Tray(icon)
      this.tray.setToolTip(APP_NAME)
      this.refresh()
      if (process.platform === 'win32') this.tray.on('click', () => this.tray?.popUpContextMenu())
      this.tray.on('double-click', () => this.open())
      return true
    } catch {
      this.tray?.destroy(); this.tray = null
      console.warn('[DevFusion] Tray unavailable; closing the last window will exit normally.')
      return false
    }
  }

  hasTray(): boolean { return this.tray !== null && !this.tray.isDestroyed() }

  notifyColor(hex: string): void {
    if (this.window && !this.window.isDestroyed()) this.window.webContents.send('color:picked', hex)
  }

  private copy(text: string): void {
    try { clipboard.writeText(text) }
    catch { void dialog.showMessageBox({ type: 'warning', title: APP_NAME, message: 'Clipboard copy failed.', detail: 'Open the matching tool and retry the Copy action.' }).catch(() => {}) }
  }

  open(target?: QuickTarget): void {
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
    const navigate = (): void => { if (!win.isDestroyed()) win.webContents.send('app:openTool', target) }
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', navigate)
    else navigate()
  }

  refresh(): void {
    if (!this.hasTray()) return
    const last = this.picker.getLast()
    const mock = this.mockApi?.status()
    const template: MenuItemConstructorOptions[] = [
      { label: 'Open DevFusion', click: () => this.open() },
      { type: 'separator' },
      { label: 'Pick screen color…', enabled: !this.picker.isBusy() && !this.ocr?.isBusy(), click: () => { void this.picker.pickFromTray() } },
      { label: last ? `Copy last color · ${last}` : 'Copy last color', enabled: !!last, click: () => { if (last) this.copy(last) } },
      { label: 'Copy new UUID', click: () => this.copy(randomUUID()) },
      ...(this.ocr ? [{ label: 'Extract text (OCR)', enabled: !this.ocr.isBusy() && !this.picker.isBusy(), submenu: [
        { label: 'Select screen region…', click: () => { void this.ocr!.captureFromTray('region') } },
        { label: 'Capture current screen', click: () => { void this.ocr!.captureFromTray('screen') } },
        { label: 'Open OCR · Image / PDF', click: () => this.open('text.ocr') }
      ] }] : []),
      ...(this.mockApi ? [{ label: mock?.running ? `Mock API · port ${mock.port}` : 'Mock API · stopped', submenu: [
        { label: 'Open Mock API', click: () => this.open('network.mock-api') },
        { label: 'Copy base URL', enabled: !!mock?.baseUrl, click: () => { if (mock?.baseUrl) this.copy(mock.baseUrl) } },
        { label: 'Stop server', enabled: !!mock?.running, click: () => { void this.mockApi!.stop().catch(() => { void dialog.showMessageBox({ type: 'warning', title: APP_NAME, message: 'Could not stop Mock API.', detail: 'Open Mock API to retry, or Quit DevFusion.' }).catch(() => {}) }) } }
      ] }] : []),
      { type: 'separator' },
      { label: 'Open tool', submenu: QUICK_TOOLS.map((tool) => ({ label: tool.name, click: () => this.open(tool.id) })) },
      { type: 'separator' },
      { label: 'Quit DevFusion', click: this.quit }
    ]
    this.tray!.setContextMenu(Menu.buildFromTemplate(template))
  }

  dispose(): void { this.picker.dispose(); this.ocr?.dispose(); this.tray?.destroy(); this.tray = null }
}
