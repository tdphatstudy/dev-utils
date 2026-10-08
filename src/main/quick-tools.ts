import { BrowserWindow, ipcMain, nativeTheme, screen, type IpcMainInvokeEvent } from 'electron'
import { isAbsolute, join, relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { QUICK_WIDGETS, type QuickWidget } from '@shared/quick-tools'
import type { LocaleId } from '@shared/i18n/locales'
import { appWindowIcon } from './branding'
import { assertTrustedIpc, isRendererUrl } from './ipc-trust'
import { is } from './env'
import type { ClipboardManager } from './clipboard/service'
import type { ScreenColorPicker } from './color-picker'
import type { DesktopOcr } from './ocr'
import type { GlobalShortcuts } from './global-shortcuts'
import { MOCK_LIMITS } from '@shared/mock-api/types'
import type { MockApiServer } from './mock-api-server'
import type { CaptureMode } from '@shared/ocr/types'

export class QuickTools {
  private window: BrowserWindow | null = null
  private kind: QuickWidget = 'clipboard'
  private pinned = false
  private retained = new Map<BrowserWindow, number>()
  private expected = ''
  constructor(private readonly clipboard: ClipboardManager, private readonly picker: ScreenColorPicker, private readonly ocr: DesktopOcr, private readonly locale: () => LocaleId, private readonly mock?: MockApiServer) {}
  async open(value: unknown): Promise<void> {
    if (!QUICK_WIDGETS.includes(value as QuickWidget)) throw new Error('Choose a supported quick widget.')
    const kind = value as QuickWidget
    if (kind === 'color') { await this.pick(); return }
    if (this.window && !this.window.isDestroyed()) {
      if (this.kind === kind) { this.window.show(); this.window.focus(); return }
      this.close()
    }
    this.kind = kind; this.pinned = false
    let display = screen.getPrimaryDisplay()
    try { display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()) } catch { /* Wayland */ }
    const area = display.workArea, width = Math.min(kind === 'clipboard' ? 620 : kind === 'mock' || kind === 'ocr' ? 540 : 460, area.width), height = Math.min(kind === 'clipboard' ? 600 : 540, area.height)
    const win = new BrowserWindow({ width, height, x: Math.round(area.x + (area.width - width) / 2), y: Math.round(area.y + (area.height - height) / 2), minWidth: Math.min(380, width), minHeight: Math.min(320, height),
      icon: appWindowIcon(), title: 'DevFusion · Quick tools', frame: false, show: false, resizable: true, minimizable: false, maximizable: false, alwaysOnTop: true, skipTaskbar: true, backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#f5f6f9',
      webPreferences: { preload: join(__dirname, '../preload/quickTools.js'), partition: 'quick-tools', sandbox: true, contextIsolation: true, webSecurity: true, nodeIntegration: false, spellcheck: false, backgroundThrottling: true }
    })
    this.window = win
    win.setMenu(null); win.setAlwaysOnTop(true, 'floating')
    const dev = is.dev && process.env['ELECTRON_RENDERER_URL']
    this.expected = dev ? new URL('quick.html', dev).href : pathToFileURL(join(__dirname, '../renderer/quick.html')).href
    win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
    win.webContents.session.setPermissionCheckHandler(() => false)
    const allowed = dev ? new URL(dev).origin : null
    const rendererRoot = join(__dirname, '../renderer')
    win.webContents.session.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
      let cancel = true
      try {
        const url = new URL(details.url)
        if (url.protocol === 'file:' && !dev) {
          const path = relative(rendererRoot, fileURLToPath(url))
          cancel = isAbsolute(path) || path === '..' || path.startsWith('..' + sep)
        } else if (['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) {
          const origin = url.origin.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:')
          cancel = !allowed || origin !== allowed
        } else cancel = url.protocol !== 'data:' && url.protocol !== 'blob:'
      } catch { /* Unknown/malformed requests fail closed. */ }
      callback({ cancel })
    })
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', event => event.preventDefault()); win.webContents.on('will-redirect', event => event.preventDefault())
    win.once('closed', () => { if (this.window === win) this.window = null })
    win.on('blur', () => { if (!this.pinned && !this.retained.get(win) && this.window === win) this.close() })
    win.webContents.once('render-process-gone', () => { if (this.window === win) this.close() })
    try { await win.loadURL(this.expected); if (this.window === win && !win.isDestroyed()) { win.show(); win.focus() } }
    catch { if (this.window === win) this.close(); throw new Error('The quick widget could not load. Rebuild DevFusion and retry.') }
  }
  private trusted(event: IpcMainInvokeEvent): void {
    if (!this.window || this.window.isDestroyed() || event.sender !== this.window.webContents || event.senderFrame !== event.sender.mainFrame || !event.senderFrame || !isRendererUrl(event.senderFrame.url, this.expected)) throw new Error('This action is available only in the active quick widget.')
  }
  assertCaller(event: IpcMainInvokeEvent): void { if (this.window?.webContents === event.sender) this.trusted(event); else assertTrustedIpc(event) }
  context(event: IpcMainInvokeEvent): { kind: QuickWidget; locale: LocaleId; dark: boolean } { this.trusted(event); return { kind: this.kind, locale: this.locale(), dark: nativeTheme.shouldUseDarkColors } }
  close(): void { const win = this.window; this.window = null; if (win) this.retained.delete(win); if (win && !win.isDestroyed()) win.destroy() }
  notify(): void { if (this.window && !this.window.isDestroyed()) this.window.webContents.send('clipboard:changed') }
  notifyShortcuts(): void { if (this.window && !this.window.isDestroyed()) this.window.webContents.send('quick:shortcutsChanged') }
  async pick(): Promise<void> { if (this.picker.isBusy() || this.ocr.isBusy()) throw new Error('Finish or cancel the current screen capture first.'); this.close(); await this.picker.pickFromTray() }
  async capture(mode: unknown): Promise<void> {
    if (mode !== 'region' && mode !== 'screen') throw new Error('Choose a screen or region capture.')
    if (this.picker.isBusy() || this.ocr.isBusy()) throw new Error('Finish or cancel the current screen capture first.')
    this.close(); await this.ocr.captureFromTray(mode as CaptureMode)
  }
  private retain(win: BrowserWindow | null): () => void {
    if (win) this.retained.set(win, (this.retained.get(win) ?? 0) + 1)
    return () => {
      if (!win) return
      const count = this.retained.get(win) ?? 0
      if (count > 1) this.retained.set(win, count - 1); else this.retained.delete(win)
    }
  }
  private async recognizeRequest(value: unknown, event: IpcMainInvokeEvent): Promise<unknown> {
    const win = this.window, release = this.retain(win)
    try { return await this.ocr.recognize(value, event.sender) }
    finally { release(); if (this.window === win && win && !win.isDestroyed()) { win.show(); win.focus() } }
  }
  async recognize(id: unknown): Promise<string | null> {
    const content = this.clipboard.content(id)
    if (!content.png) throw new Error('Choose an image entry for OCR.')
    // Keep the calling widget alive during the transient OCR job, then resume it.
    const win = this.window, release = this.retain(win)
    try {
      const result = await this.ocr.recognize({ id: randomUUID(), kind: 'image', bytes: Buffer.from(content.png, 'base64'), language: 'eng+vie' }, win?.webContents ?? (() => { throw new Error('Open the clipboard widget for OCR.') })())
      if (this.clipboard.state().blocked) return null
      return result?.text ?? null
    } finally { release(); if (this.window === win && win && !win.isDestroyed()) { win.show(); win.focus() } }
  }
  register(shortcuts: GlobalShortcuts): void {
    const caller = (e: IpcMainInvokeEvent): void => this.assertCaller(e)
    ipcMain.handle('quick:open', (e, kind: unknown) => { caller(e); return this.open(kind) })
    ipcMain.handle('quick:context', e => this.context(e))
    ipcMain.handle('quick:close', e => { this.trusted(e); this.close() })
    ipcMain.handle('quick:pin', (e, value: unknown) => { this.trusted(e); if (typeof value !== 'boolean') throw new Error('Invalid widget pin.'); this.pinned = value })
    ipcMain.handle('quick:pick', e => { this.trusted(e); return this.pick() })
    ipcMain.handle('quick:lastColor', e => { this.trusted(e); return this.picker.getLast() })
    ipcMain.handle('quick:copyText', (e, value: unknown) => { this.trusted(e); return this.clipboard.copyText(value, true) })
    ipcMain.handle('quick:copyImage', (e, value: unknown) => { this.trusted(e); return this.clipboard.copyImage(value) })
    ipcMain.handle('quick:ocr', (e, value: unknown) => { this.trusted(e); return this.recognizeRequest(value, e) })
    ipcMain.handle('quick:ocrCapture', (e, mode: unknown) => { this.trusted(e); return this.capture(mode) })
    ipcMain.handle('quick:ocrCancel', (e, id: unknown) => { this.trusted(e); return this.ocr.cancel(id, e.sender) })
    const server = (e: IpcMainInvokeEvent): MockApiServer => { this.trusted(e); if (!this.mock) throw new Error('Mock API requires the desktop app.'); return this.mock }
    ipcMain.handle('quick:mockStatus', e => server(e).status())
    ipcMain.handle('quick:mockConfig', e => server(e).getConfig())
    ipcMain.handle('quick:mockStop', e => server(e).stop())
    ipcMain.handle('quick:mockStart', (e, value: unknown) => {
      const mock = server(e)
      if (typeof value !== 'string' || Buffer.byteLength(value) > MOCK_LIMITS.yamlBytes) throw new Error('Mock API YAML must be a string of at most 1 MiB.')
      return mock.start(value)
    })
    ipcMain.handle('quick:shortcuts', e => { caller(e); return shortcuts.state() })
    ipcMain.handle('quick:setShortcuts', (e, value: unknown) => { caller(e); return shortcuts.set(value) })
    ipcMain.handle('quick:checkShortcut', (e, value: unknown) => { caller(e); return shortcuts.check(value) })
    ipcMain.handle('clipboard:state', e => { caller(e); return this.clipboard.state() })
    ipcMain.handle('clipboard:configure', (e, value: unknown) => { caller(e); return this.clipboard.configure(value) })
    ipcMain.handle('clipboard:pause', (e, value: unknown) => { caller(e); return this.clipboard.pause(value) })
    ipcMain.handle('clipboard:list', (e, query: unknown) => { caller(e); return this.clipboard.list(query) })
    ipcMain.handle('clipboard:content', (e, id: unknown) => { caller(e); return this.clipboard.content(id) })
    ipcMain.handle('clipboard:copy', async (e, id: unknown, mode: unknown, close: unknown) => { caller(e); if (close !== undefined && typeof close !== 'boolean') throw new Error('Invalid close option.'); await this.clipboard.copy(id, mode); if (close && this.window?.webContents === e.sender) this.close() })
    ipcMain.handle('clipboard:copyText', async (e, text: unknown, close: unknown) => { caller(e); if (close !== undefined && typeof close !== 'boolean') throw new Error('Invalid close option.'); await this.clipboard.copyText(text); if (close && this.window?.webContents === e.sender) this.close() })
    ipcMain.handle('clipboard:update', (e, id: unknown, value: unknown) => { caller(e); this.clipboard.update(id, value) })
    ipcMain.handle('clipboard:remove', (e, ids: unknown) => { caller(e); this.clipboard.remove(ids) })
    ipcMain.handle('clipboard:clear', e => { caller(e); return this.clipboard.clear() })
    ipcMain.handle('clipboard:captureCurrent', e => { caller(e); return this.clipboard.captureCurrent() })
    ipcMain.handle('clipboard:ocr', (e, id: unknown) => { this.trusted(e); return this.recognize(id) })
  }
}
