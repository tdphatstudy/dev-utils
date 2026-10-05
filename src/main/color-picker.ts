import { BrowserWindow, clipboard, ipcMain, dialog, screen, type IpcMainInvokeEvent, type WebContents } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { colorFromHex, type ColorValue, type ScreenColorResult } from '@shared/color'
import { isColorFormat, type PickerView } from '@shared/color/picker'
import { assertTrustedIpc, isRendererUrl } from './ipc-trust'
import { resourcePath } from './branding'
import { captureDesktopFrames } from './screen-snapshot'

type Helper = { win: BrowserWindow; view: PickerView; ready: Promise<void>; markReady: () => void }
type Job = {
  source: string
  phase: 'capturing' | 'selecting' | 'result' | 'closed'
  helpers: Map<number, Helper>
  owner?: WebContents
  ownerClosed: () => void
  displayChanged: () => void
  cycle: number
  abortCapture?: () => void
  deadline?: ReturnType<typeof setTimeout>
  color?: ColorValue
  settled: boolean
  resolve: (value: ScreenColorResult) => void
  reject: (error: unknown) => void
}

export class ScreenColorPicker {
  private job: Job | null = null
  private busy = false
  private last: string | null = null
  constructor(private readonly changed: (selected?: string) => void = () => {}, private readonly canStart: () => boolean = () => true) {}

  getLast(): string | null { return this.last }
  isBusy(): boolean { return this.busy }
  dispose(): void { if (this.job) this.closeJob(this.job) }

  pick(owner?: WebContents): Promise<ScreenColorResult> {
    if (!this.canStart()) return Promise.reject(new Error('Finish or cancel OCR before picking a screen color.'))
    if (this.busy) return Promise.reject(new Error('A screen color picker is already open. Select a color or press Esc.'))
    const source = resourcePath('color-picker.html')
    if (!source) return Promise.reject(new Error('Screen picker resource is missing. Reinstall the app or use manual colors.'))
    this.dispose()
    let resolve!: Job['resolve'], reject!: Job['reject']
    const result = new Promise<ScreenColorResult>((done, fail) => { resolve = done; reject = fail })
    const job: Job = {
      source, phase: 'capturing', helpers: new Map(), owner, cycle: 0, settled: false, resolve, reject,
      ownerClosed: () => this.closeJob(job), displayChanged: () => this.closeJob(job)
    }
    this.job = job
    owner?.once('destroyed', job.ownerClosed)
    screen.on('display-added', job.displayChanged)
    screen.on('display-removed', job.displayChanged)
    screen.on('display-metrics-changed', job.displayChanged)
    void this.startCapture(job)
    return result
  }

  private current(job: Job): boolean { return this.job === job && job.phase !== 'closed' && !job.owner?.isDestroyed() }
  private settle(job: Job, result: ScreenColorResult, error?: unknown): void {
    if (job.settled) return
    job.settled = true
    if (error) job.reject(error)
    else job.resolve(result)
  }
  private destroyHelpers(job: Job): void {
    const helpers = [...job.helpers.values()]
    job.helpers.clear()
    for (const helper of helpers) { helper.markReady(); if (!helper.win.isDestroyed()) helper.win.destroy() }
  }
  private stopCapture(job: Job): void {
    job.cycle++; job.abortCapture?.(); job.abortCapture = undefined
    clearTimeout(job.deadline); job.deadline = undefined
    this.destroyHelpers(job)
  }
  private closeJob(job: Job, error?: unknown): void {
    if (job.phase === 'closed') return
    job.phase = 'closed'; this.stopCapture(job)
    job.owner?.removeListener('destroyed', job.ownerClosed)
    screen.removeListener('display-added', job.displayChanged)
    screen.removeListener('display-removed', job.displayChanged)
    screen.removeListener('display-metrics-changed', job.displayChanged)
    this.settle(job, null, error)
    if (this.job === job) { this.job = null; this.busy = false; this.changed() }
  }

  private helper(job: Job, view: PickerView, bounds: { x: number; y: number; width: number; height: number }): Helper {
    const overlay = view.kind === 'overlay'
    const win = new BrowserWindow({
      ...bounds, show: false, frame: !overlay, resizable: false, minimizable: false, maximizable: false,
      thickFrame: false, fullscreen: overlay && process.platform !== 'darwin',
      movable: !overlay, alwaysOnTop: true, skipTaskbar: true, autoHideMenuBar: true, acceptFirstMouse: true,
      title: overlay ? 'DevFusion · Pick anywhere on your desktop' : 'DevFusion · Selected color',
      backgroundColor: '#151829', hasShadow: !overlay,
      webPreferences: { preload: join(__dirname, '../preload/colorPicker.js'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, spellcheck: false, partition: 'color-picker' }
    })
    let markReady!: () => void
    const ready = new Promise<void>((resolve) => { markReady = resolve })
    const helper = { win, view, ready, markReady }
    const id = win.webContents.id
    job.helpers.set(id, helper)
    win.setMenu(null)
    win.setAlwaysOnTop(true, overlay ? 'screen-saver' : 'floating')
    if (process.platform === 'darwin') win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    win.once('closed', () => { if (job.helpers.has(id)) this.closeJob(job) })
    win.webContents.once('render-process-gone', () => {
      if (job.helpers.has(id)) this.closeJob(job, new Error('The color picker closed unexpectedly. Try again.'))
    })
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', (event) => event.preventDefault())
    win.webContents.on('will-redirect', (event) => event.preventDefault())
    return helper
  }

  private async startCapture(job: Job): Promise<void> {
    if (!this.current(job)) return
    if (!this.canStart()) throw new Error('Finish or cancel OCR before picking a screen color.')
    this.stopCapture(job); job.phase = 'capturing'
    const cycle = job.cycle
    this.busy = true; this.changed()
    let abort!: (value: null) => void
    const aborted = new Promise<null>((resolve) => { abort = resolve })
    job.abortCapture = () => abort(null)
    job.deadline = setTimeout(() => { void this.cancelCapture(job) }, 120000)
    try {
      // Capture the OS desktop before creating any overlay, never the helper window.
      const frames = await Promise.race([captureDesktopFrames(), aborted])
      if (!frames || !this.current(job) || job.cycle !== cycle) return
      const helpers = frames.map((frame) => this.helper(job, { kind: 'overlay', image: frame.image }, frame.bounds))
      await Promise.race([Promise.all(helpers.map((helper) => this.loadHelper(job, helper))), aborted])
      if (!this.current(job) || job.cycle !== cycle) return
      job.phase = 'selecting'
      for (const helper of helpers) helper.win.showInactive()
      let focus = helpers[0]
      try {
        const cursor = screen.getCursorScreenPoint()
        focus = helpers.find(({ win }) => { const b = win.getBounds(); return cursor.x >= b.x && cursor.x < b.x + b.width && cursor.y >= b.y && cursor.y < b.y + b.height }) ?? focus
      } catch { /* Wayland does not provide cursor screen coordinates. */ }
      focus.win.focus()
    } catch (error) {
      if (!this.current(job) || job.cycle !== cycle) return
      this.stopCapture(job); this.busy = false; this.changed()
      if (job.color) {
        try { await this.showResult(job, error instanceof Error ? error.message : 'Could not capture the desktop. Try again.') }
        catch (popupError) { this.closeJob(job, popupError) }
      } else this.closeJob(job, error)
    }
  }

  private async loadHelper(job: Job, helper: Helper): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        helper.win.loadFile(job.source).then(() => helper.ready),
        new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('The color picker could not load. Close it and try again.')), 15000) })
      ])
    } finally { clearTimeout(timer) }
  }

  private async showResult(job: Job, error?: string): Promise<void> {
    if (!this.current(job) || !job.color) return
    job.phase = 'result'
    let display = screen.getPrimaryDisplay()
    try { display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()) } catch { /* Wayland */ }
    const area = display.workArea
    const width = Math.min(390, area.width), height = Math.min(460, area.height)
    const helper = this.helper(job, { kind: 'result', color: job.color, error }, { width, height, x: Math.round(area.x + (area.width - width) / 2), y: Math.round(area.y + (area.height - height) / 2) })
    await this.loadHelper(job, helper)
    if (this.current(job) && !helper.win.isDestroyed()) { helper.win.show(); helper.win.focus() }
  }

  private trustedHelper(event: IpcMainInvokeEvent, kind?: PickerView['kind']): { job: Job; helper: Helper } {
    const job = this.job, helper = job?.helpers.get(event.sender.id)
    if (!job || !helper || !this.current(job) || helper.win.isDestroyed() ||
        !event.senderFrame || event.senderFrame !== event.sender.mainFrame ||
        !isRendererUrl(event.senderFrame.url, pathToFileURL(job.source).href) || (kind && helper.view.kind !== kind)) throw new Error('This action is available only in the active color picker.')
    return { job, helper }
  }
  view(event: IpcMainInvokeEvent): PickerView { return this.trustedHelper(event).helper.view }
  ready(event: IpcMainInvokeEvent): void { this.trustedHelper(event).helper.markReady() }

  async select(event: IpcMainInvokeEvent, hex: unknown): Promise<void> {
    const { job } = this.trustedHelper(event, 'overlay')
    if (job.phase !== 'selecting' || typeof hex !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(hex)) throw new Error('Invalid screen color selection.')
    const color = colorFromHex(hex)!
    this.stopCapture(job); job.color = color; this.busy = false
    try {
      await this.showResult(job)
      if (!this.current(job)) return
      this.last = color.hex; this.changed(color.hex); this.settle(job, { hex: color.hex })
    } catch (error) { this.closeJob(job, error); throw error }
  }
  private async cancelCapture(job: Job): Promise<void> {
    if (!this.current(job)) return
    this.stopCapture(job); this.busy = false; this.changed()
    if (job.color) {
      try { await this.showResult(job) } catch (error) { this.closeJob(job, error) }
    } else this.closeJob(job)
  }
  cancel(event: IpcMainInvokeEvent): Promise<void> { return this.cancelCapture(this.trustedHelper(event, 'overlay').job) }
  repick(event: IpcMainInvokeEvent): Promise<void> { return this.startCapture(this.trustedHelper(event, 'result').job) }
  copy(event: IpcMainInvokeEvent, format: unknown): void {
    const { job } = this.trustedHelper(event, 'result')
    if (!job.color || !isColorFormat(format)) throw new Error('Choose HEX, RGB, HSL or HSV.')
    clipboard.writeText(job.color[format])
  }
  close(event: IpcMainInvokeEvent): void { this.closeJob(this.trustedHelper(event).job) }

  async pickFromTray(): Promise<void> {
    try { await this.pick() }
    catch (error) { await dialog.showMessageBox({ type: 'error', title: 'DevFusion', message: 'Could not pick a screen color.', detail: error instanceof Error ? error.message : 'Open Color Picker and try a manual color.' }).catch(() => {}) }
  }
}

export function registerColorPickerIpc(picker: ScreenColorPicker): void {
  ipcMain.handle('color:pickScreen', (event) => { assertTrustedIpc(event); return picker.pick(event.sender) })
  ipcMain.handle('color:lastScreen', (event) => { assertTrustedIpc(event); return picker.getLast() })
  ipcMain.handle('screenPicker:view', (event) => picker.view(event))
  ipcMain.handle('screenPicker:ready', (event) => picker.ready(event))
  ipcMain.handle('screenPicker:select', (event, hex: unknown) => picker.select(event, hex))
  ipcMain.handle('screenPicker:cancel', (event) => picker.cancel(event))
  ipcMain.handle('screenPicker:repick', (event) => picker.repick(event))
  ipcMain.handle('screenPicker:copy', (event, format: unknown) => picker.copy(event, format))
  ipcMain.handle('screenPicker:close', (event) => picker.close(event))
}
