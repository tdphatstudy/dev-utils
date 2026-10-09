import { nativeTheme, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { QUICK_WIDGETS, type QuickWidget } from '@shared/quick-tools'
import type { LocaleId } from '@shared/i18n/locales'
import { assertTrustedIpc, isRendererUrl } from '../ipc-trust'
import { is } from '../env'
import type { ClipboardManager } from '../clipboard/service'
import type { ScreenColorPicker } from '../color-picker'
import type { DesktopOcr } from '../ocr'
import type { GlobalShortcuts } from '../global-shortcuts'
import type { MockApiServer } from '../mock-api-server'
import type { CaptureMode } from '@shared/ocr/types'

import { createQuickWindow } from './window'
import { configureQuickWindowSecurity } from './security'
import { registerQuickToolsIpc } from './ipc'
import { IpcTaskPool } from '../ipc-task-pool'
import { DesktopPaste, type PasteAdapter, type PasteTarget } from '../platform/clipboard-paste'

export class QuickTools {
  private window: BrowserWindow | null = null
  private kind: QuickWidget = 'clipboard'
  private pinned = false
  private retained = new Map<BrowserWindow, number>()
  private expected = ''
  private target: PasteTarget | null = null
  private readonly opening = new IpcTaskPool(1, 'A quick widget is opening. Wait for it to finish.')

  constructor(
    private readonly clipboard: ClipboardManager,
    private readonly picker: ScreenColorPicker,
    private readonly ocr: DesktopOcr,
    private readonly locale: () => LocaleId,
    private readonly mock?: MockApiServer,
    private readonly pasteAdapter: PasteAdapter = new DesktopPaste()
  ) {}

  async open(value: unknown): Promise<void> {
    if (!QUICK_WIDGETS.includes(value as QuickWidget)) throw new Error('Choose a supported quick widget.')
    const kind = value as QuickWidget
    if (kind === 'color') { await this.pick(); return }
    return this.opening.run(() => this.openWidget(kind))
  }

  private async openWidget(kind: QuickWidget): Promise<void> {
    let target = this.target
    if (this.window && !this.window.isDestroyed()) {
      if (this.kind === kind) {
        const win = this.window
        if (kind === 'clipboard') {
          const currentTarget = await this.pasteAdapter.capture()
          if (currentTarget) target = currentTarget
        }
        if (this.window === win && !win.isDestroyed()) {
          this.target = target; win.webContents.send('quick:pasteTargetChanged', !!target)
          win.show(); win.focus(); return
        }
      }
      this.close()
    } else target = kind === 'clipboard' ? await this.pasteAdapter.capture() : null
    this.target = target
    this.kind = kind
    this.pinned = false
    const win = createQuickWindow(kind)
    this.window = win
    const dev = is.dev && process.env['ELECTRON_RENDERER_URL']
    this.expected = dev ? new URL('quick.html', dev).href : pathToFileURL(join(__dirname, '../renderer/quick.html')).href
    configureQuickWindowSecurity(win, dev)
    win.once('closed', () => { if (this.window === win) this.window = null })
    win.on('blur', () => { if (!this.pinned && !this.retained.get(win) && this.window === win) this.close() })
    win.webContents.once('render-process-gone', () => { if (this.window === win) this.close() })
    try { await win.loadURL(this.expected); if (this.window === win && !win.isDestroyed()) { win.show(); win.focus() } }
    catch { if (this.window === win) this.close(); throw new Error('The quick widget could not load. Rebuild DevFusion and retry.') }
  }
  assertWidget(event: IpcMainInvokeEvent): void {
    if (!this.window || this.window.isDestroyed() || event.sender !== this.window.webContents || event.senderFrame !== event.sender.mainFrame || !event.senderFrame || !isRendererUrl(event.senderFrame.url, this.expected)) throw new Error('This action is available only in the active quick widget.')
  }
  assertCaller(event: IpcMainInvokeEvent): void { if (this.window?.webContents === event.sender) this.assertWidget(event); else assertTrustedIpc(event) }
  context(event: IpcMainInvokeEvent): { kind: QuickWidget; locale: LocaleId; dark: boolean; canPaste: boolean } { this.assertWidget(event); return { kind: this.kind, locale: this.locale(), dark: nativeTheme.shouldUseDarkColors, canPaste: !!this.target } }
  pin(value: boolean): void { this.pinned = value }
  closeForSender(event: IpcMainInvokeEvent): void { if (this.window?.webContents === event.sender) this.close() }
  close(): void { const win = this.window; this.window = null; this.target = null; if (win) this.retained.delete(win); if (win && !win.isDestroyed()) win.destroy() }
  async paste(event: IpcMainInvokeEvent, write: () => Promise<void>): Promise<void> {
    this.assertWidget(event)
    const win = this.window!, target = this.target, release = this.retain(win), revision = this.clipboard.visibilityRevision()
    if (!target) { release(); throw new Error('Open Clipboard Manager with the global shortcut while your target input is focused.') }
    try {
      await write()
      this.assertWidget(event)
      if (this.clipboard.state().blocked || this.clipboard.visibilityRevision() !== revision) throw new Error('Clipboard access changed. Reopen the widget.')
      // Launch the helper while this widget still owns foreground permission;
      // Windows can grant that permission to a process started by the active app.
      const pending = this.pasteAdapter.paste(target)
      win.hide()
      try { await pending }
      catch (error) { if (this.window === win && !win.isDestroyed()) { win.show(); win.focus() }; throw error }
      if (this.window === win) this.close()
    } finally { release() }
  }
  notify(): void { if (this.window && !this.window.isDestroyed()) this.window.webContents.send('clipboard:changed') }
  notifyShortcuts(): void { if (this.window && !this.window.isDestroyed()) this.window.webContents.send('quick:shortcutsChanged') }
  notifyAppearance(): void { if (this.window && !this.window.isDestroyed()) this.window.webContents.send('quick:appearanceChanged', nativeTheme.shouldUseDarkColors) }
  notifyLanguage(): void {
    const win = this.window
    if (win && !win.isDestroyed() && isRendererUrl(win.webContents.mainFrame.url, this.expected)) win.webContents.send('quick:languageChanged', this.locale())
  }
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
  async recognizeRequest(value: unknown, event: IpcMainInvokeEvent): Promise<unknown> {
    const win = this.window, release = this.retain(win)
    try { return await this.ocr.recognize(value, event.sender, false) }
    finally { release(); if (this.window === win && win && !win.isDestroyed()) { win.show(); win.focus() } }
  }
  async recognize(id: unknown, event: IpcMainInvokeEvent): Promise<string | null> {
    const content = this.clipboard.content(id)
    const revision = this.clipboard.visibilityRevision()
    if (!content.png) throw new Error('Choose an image entry for OCR.')
    const win = this.window?.webContents === event.sender ? this.window : null, release = this.retain(win)
    try {
      const result = await this.ocr.recognize({ id: randomUUID(), kind: 'image', bytes: Buffer.from(content.png, 'base64'), language: 'eng+vie' }, event.sender, false)
      if (this.clipboard.state().blocked || this.clipboard.visibilityRevision() !== revision) return null
      this.clipboard.content(id)
      return result?.text ?? null
    } finally { release(); if (this.window === win && win && !win.isDestroyed()) { win.show(); win.focus() } }
  }
  register(shortcuts: GlobalShortcuts): void {
    registerQuickToolsIpc(this, this.clipboard, this.picker, this.ocr, this.mock, shortcuts)
  }
}
