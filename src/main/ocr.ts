import { BrowserWindow, clipboard, dialog, ipcMain, net, screen, session, type IpcMainInvokeEvent, type WebContents } from 'electron'
import { join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { resourcePath } from './branding'
import { assertTrustedIpc, isRendererUrl } from './ipc-trust'
import { is } from './env'
import { captureDesktopFrames } from './screen-snapshot'
import { pixelRect, validateImageSize, validateLanguage, validateOcrId, validateOcrInput, validateOcrResult, MAX_OCR_BYTES, type CaptureMode, type OcrInput, type OcrLanguage, type OcrProgress, type OcrResult, type OcrView, type OcrSelection } from '@shared/ocr/types'

type Helper = { win: BrowserWindow; view: OcrView; url: string; ready: Promise<void>; markReady: () => void }
type Job = { id: string; owner?: WebContents; language: OcrLanguage; helpers: Map<number, Helper>; result?: OcrResult;
  phase: 'capture' | 'select' | 'run' | 'result' | 'closed'; timer?: ReturnType<typeof setTimeout>; ownerClosed: () => void; displayChanged: () => void;
  resolve: (value: OcrResult | null) => void; reject: (error: unknown) => void; settled: boolean }

function snapshotHeader(image: string): Buffer {
  const prefix = 'data:image/png;base64,'
  if (!image.startsWith(prefix)) throw new Error('Unsupported screen snapshot format.')
  return Buffer.from(image.slice(prefix.length, prefix.length + 32), 'base64')
}

export class DesktopOcr {
  private job: Job | null = null
  private protocolReady = false
  constructor(private readonly changed: () => void = () => {}, private readonly canStart: () => boolean = () => true) {}
  isBusy(): boolean { return !!this.job && this.job.phase !== 'result' }
  dispose(): void { if (this.job) this.closeJob(this.job) }

  private start(id: string, language: OcrLanguage, owner?: WebContents): { job: Job; result: Promise<OcrResult | null> } {
    validateOcrId(id); validateLanguage(language)
    if (this.isBusy()) throw new Error('OCR is already running. Cancel it or wait for completion.')
    if (!this.canStart()) throw new Error('Finish picking a screen color before starting OCR.')
    this.dispose()
    let resolve!: Job['resolve'], reject!: Job['reject']
    const result = new Promise<OcrResult | null>((ok, fail) => { resolve = ok; reject = fail })
    const job: Job = { id, language, owner, helpers: new Map(), phase: 'capture', resolve, reject, settled: false,
      ownerClosed: () => this.closeJob(job), displayChanged: () => { if (job.phase === 'capture' || job.phase === 'select') this.closeJob(job) } }
    this.job = job
    owner?.once('destroyed', job.ownerClosed)
    screen.on('display-added', job.displayChanged); screen.on('display-removed', job.displayChanged); screen.on('display-metrics-changed', job.displayChanged)
    job.timer = setTimeout(() => this.closeJob(job, new Error('OCR timed out after five minutes. Try a smaller image or PDF.')), 300000)
    this.changed()
    return { job, result }
  }
  private current(job: Job): boolean { return this.job === job && job.phase !== 'closed' && !job.owner?.isDestroyed() }
  private settle(job: Job, value: OcrResult | null, error?: unknown): void {
    if (job.settled) return
    job.settled = true
    if (error) job.reject(error); else job.resolve(value)
  }
  private destroyHelpers(job: Job): void {
    const helpers = [...job.helpers.values()]; job.helpers.clear()
    for (const helper of helpers) { helper.markReady(); if (!helper.win.isDestroyed()) helper.win.destroy() }
    // Non-persistent partition; discard model/PDF asset memory caches as well.
    if (this.protocolReady) void session.fromPartition('ocr-transient').clearCache().catch(() => {})
  }
  private closeJob(job: Job, error?: unknown): void {
    if (job.phase === 'closed') return
    job.phase = 'closed'; clearTimeout(job.timer); this.destroyHelpers(job)
    job.owner?.removeListener('destroyed', job.ownerClosed)
    screen.removeListener('display-added', job.displayChanged); screen.removeListener('display-removed', job.displayChanged); screen.removeListener('display-metrics-changed', job.displayChanged)
    this.settle(job, null, error)
    if (this.job === job) { this.job = null; this.changed() }
  }
  private prepareSession(): void {
    if (this.protocolReady) return
    const partition = session.fromPartition('ocr-transient')
    partition.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
    partition.setPermissionCheckHandler(() => false)
    const rendererRoot = resolve(__dirname, '../renderer')
    partition.protocol.handle('devfusion-ocr', (request) => {
      try {
        const url = new URL(request.url), path = decodeURIComponent(url.pathname)
        const target = resolve(rendererRoot, '.' + path)
        if (url.host !== 'local' || (path !== '/ocr.html' && !path.startsWith('/assets/') && !path.startsWith('/ocr-assets/')) ||
            !target.startsWith(rendererRoot + sep) || path.split('/').some((part) => part === '..' || part === '.') || path.includes('\\') || path.includes('\0')) return new Response('Not found', { status: 404 })
        return net.fetch(pathToFileURL(target).href)
      } catch { return new Response('Not found', { status: 404 }) }
    })
    const devOrigin = is.dev && process.env['ELECTRON_RENDERER_URL'] ? new URL(process.env['ELECTRON_RENDERER_URL']).origin : null
    partition.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
      callback({ cancel: !devOrigin || new URL(details.url).origin !== devOrigin })
    })
    this.protocolReady = true
  }
  private helper(job: Job, view: OcrView, bounds?: Electron.Rectangle): Helper {
    this.prepareSession()
    const overlay = view.kind === 'region'
    const file = resourcePath('ocr-helper.html')
    if (view.kind !== 'run' && !file) throw new Error('OCR helper resources are missing. Rebuild DevFusion.')
    const dev = is.dev && process.env['ELECTRON_RENDERER_URL']
    const url = view.kind === 'run' ? (dev ? new URL('ocr.html', dev).href : 'devfusion-ocr://local/ocr.html') : pathToFileURL(file!).href
    const win = new BrowserWindow({
      width: 620, height: view.kind === 'run' ? 260 : 510, ...bounds, show: false, frame: !overlay,
      fullscreen: overlay && process.platform !== 'darwin', thickFrame: false, resizable: !overlay, minimizable: false, maximizable: false,
      alwaysOnTop: true, skipTaskbar: true, autoHideMenuBar: true, backgroundColor: '#171923', title: 'DevFusion · OCR',
      webPreferences: { preload: join(__dirname, '../preload/ocrHelper.js'), sandbox: true, contextIsolation: true, webSecurity: true, nodeIntegration: false,
        spellcheck: false, partition: 'ocr-transient' }
    })
    win.setMenu(null); win.setAlwaysOnTop(true, overlay ? 'screen-saver' : 'floating')
    if (overlay && process.platform === 'darwin') win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    let markReady!: () => void
    const ready = new Promise<void>((done) => { markReady = done })
    const helper = { win, view, url, ready, markReady }, id = win.webContents.id
    job.helpers.set(id, helper)
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', (event) => event.preventDefault()); win.webContents.on('will-redirect', (event) => event.preventDefault())
    win.once('closed', () => { if (job.helpers.has(id)) this.closeJob(job) })
    win.webContents.once('render-process-gone', () => { if (job.helpers.has(id)) this.closeJob(job, new Error('OCR stopped unexpectedly. Try a smaller input.')) })
    return helper
  }
  private async load(job: Job, helper: Helper, show = true): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([helper.win.loadURL(helper.url).then(() => helper.ready), new Promise<never>((_ok, fail) => { timer = setTimeout(() => fail(new Error('OCR window failed to load. Rebuild DevFusion and retry.')), 15000) })])
    } finally { clearTimeout(timer) }
    if (show && this.current(job) && !helper.win.isDestroyed()) { helper.win.show(); helper.win.focus() }
  }
  private async run(job: Job, input: OcrInput): Promise<void> {
    if (!this.current(job)) return
    job.phase = 'run'; this.destroyHelpers(job)
    try { await this.load(job, this.helper(job, { kind: 'run', input })) }
    catch (error) { if (this.current(job)) this.closeJob(job, error) }
  }
  recognize(value: unknown, owner: WebContents): Promise<OcrResult | null> {
    const input = validateOcrInput(value), id = validateOcrId((value as { id?: unknown }).id)
    const { job, result } = this.start(id, input.language, owner)
    void this.run(job, input)
    return result
  }
  capture(value: unknown, owner?: WebContents): Promise<OcrResult | null> {
    const request = value as { id?: unknown; mode?: unknown; language?: unknown } | null
    if (!request || (request.mode !== 'screen' && request.mode !== 'region')) throw new Error('Choose a screen or region capture.')
    const { job, result } = this.start(validateOcrId(request.id), validateLanguage(request.language), owner)
    void this.captureJob(job, request.mode)
    return result
  }
  private async captureJob(job: Job, mode: CaptureMode): Promise<void> {
    try {
      const frames = await captureDesktopFrames()
      if (!this.current(job)) return
      if (mode === 'screen') {
        let display = screen.getPrimaryDisplay()
        try { display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()) } catch { /* Wayland */ }
        const frame = frames.find((item) => item.bounds.x === display.bounds.x && item.bounds.y === display.bounds.y) ?? frames[0]
        validateImageSize(snapshotHeader(frame.image))
        if (frame.image.length - frame.image.indexOf(',') - 1 > Math.ceil(MAX_OCR_BYTES / 3) * 4) throw new Error('Captured screen exceeds 32 MB. Select a smaller region.')
        const bytes = Buffer.from(frame.image.slice(frame.image.indexOf(',') + 1), 'base64')
        await this.run(job, validateOcrInput({ kind: 'image', bytes, language: job.language }))
      } else {
        const helpers = frames.map((frame) => {
          // Native snapshots are PNG. Read only IHDR dimensions here; decoding
          // and cropping stay in a disposable renderer, avoiding an additional
          // large NativeImage allocation/finalizer in the resident main process.
          const header = snapshotHeader(frame.image)
          const width = header.readUInt32BE(16), height = header.readUInt32BE(20)
          return this.helper(job, { kind: 'region', image: frame.image, width, height }, frame.bounds)
        })
        // Load every display before enabling a selection; no cursor-only picker.
        await Promise.all(helpers.map((helper) => this.load(job, helper, false)))
        if (this.current(job)) {
          job.phase = 'select'
          for (const helper of helpers) helper.win.showInactive()
          let focus = helpers[0]
          try {
            const point = screen.getCursorScreenPoint()
            focus = helpers.find(({ win }) => { const b = win.getBounds(); return point.x >= b.x && point.x < b.x + b.width && point.y >= b.y && point.y < b.y + b.height }) ?? focus
          } catch { /* Wayland */ }
          focus.win.focus()
        }
      }
    } catch (error) { if (this.current(job)) this.closeJob(job, error) }
  }
  private trusted(event: IpcMainInvokeEvent, kind?: OcrView['kind']): { job: Job; helper: Helper } {
    const job = this.job, helper = job?.helpers.get(event.sender.id)
    if (!job || !helper || !this.current(job) || helper.win.isDestroyed() || !event.senderFrame || event.senderFrame !== event.sender.mainFrame ||
        !isRendererUrl(event.senderFrame.url, helper.url) || (kind && helper.view.kind !== kind)) throw new Error('This action is available only in the active OCR window.')
    return { job, helper }
  }
  view(event: IpcMainInvokeEvent): OcrView { return this.trusted(event).helper.view }
  ready(event: IpcMainInvokeEvent): void { this.trusted(event).helper.markReady() }
  async select(event: IpcMainInvokeEvent, value: unknown): Promise<void> {
    const { job, helper } = this.trusted(event, 'region')
    if (job.phase !== 'select' || helper.view.kind !== 'region') throw new Error('Screen selection is not ready.')
    const selection = value as OcrSelection | null
    if (!selection) throw new Error('Invalid OCR region selection.')
    const expected = pixelRect(selection.rect, helper.view.width, helper.view.height)
    const input = validateOcrInput({ kind: 'image', bytes: selection.bytes, language: job.language })
    const size = validateImageSize(input.bytes)
    if (size.width !== expected.width || size.height !== expected.height) throw new Error('The captured region dimensions do not match the selection.')
    await this.run(job, input)
  }
  async complete(event: IpcMainInvokeEvent, value: unknown): Promise<void> {
    const { job } = this.trusted(event, 'run'), result = validateOcrResult(value)
    this.destroyHelpers(job); clearTimeout(job.timer)
    if (job.owner) { this.settle(job, result); this.closeJob(job); return }
    job.phase = 'result'; job.result = result; this.changed()
    try {
      await this.load(job, this.helper(job, { kind: 'result', result }))
      if (this.current(job)) this.settle(job, result)
    } catch (error) { this.closeJob(job, error) }
  }
  progress(event: IpcMainInvokeEvent, value: unknown): void {
    const { job } = this.trusted(event, 'run'), p = value as OcrProgress | null
    if (!p || typeof p.stage !== 'string' || p.stage.length > 80 || !Number.isInteger(p.page) || p.page < 1 || p.page > 50 || !Number.isInteger(p.total) || p.total < p.page || p.total > 50 || !Number.isFinite(p.percent) || p.percent < 0 || p.percent > 100) throw new Error('Invalid OCR progress.')
    job.owner?.send('ocr:progress', { id: job.id, stage: p.stage, page: p.page, total: p.total, percent: p.percent })
  }
  fail(event: IpcMainInvokeEvent, message: unknown): void {
    const { job } = this.trusted(event, 'run')
    this.closeJob(job, new Error(typeof message === 'string' && message.length <= 300 ? message : 'OCR failed. Try another image or PDF.'))
  }
  close(event: IpcMainInvokeEvent): void { this.closeJob(this.trusted(event).job) }
  copy(event: IpcMainInvokeEvent): void { const { job } = this.trusted(event, 'result'); clipboard.writeText(job.result!.text) }
  cancel(id: unknown, owner: WebContents): boolean {
    validateOcrId(id)
    if (!this.job || this.job.id !== id || this.job.owner !== owner) return false
    this.closeJob(this.job); return true
  }
  async captureFromTray(mode: CaptureMode): Promise<void> {
    try { await this.capture({ id: randomUUID(), mode, language: 'eng+vie' }) }
    catch (error) { await dialog.showMessageBox({ type: 'error', title: 'DevFusion · OCR', message: 'Could not extract text.', detail: error instanceof Error ? error.message : 'Try again with a smaller region.' }).catch(() => {}) }
  }
}

export function registerOcrIpc(ocr: DesktopOcr): void {
  ipcMain.handle('ocr:recognize', (event, value: unknown) => { assertTrustedIpc(event); return ocr.recognize(value, event.sender) })
  ipcMain.handle('ocr:capture', (event, value: unknown) => { assertTrustedIpc(event); return ocr.capture(value, event.sender) })
  ipcMain.handle('ocr:cancel', (event, id: unknown) => { assertTrustedIpc(event); return ocr.cancel(id, event.sender) })
  ipcMain.handle('ocrHelper:view', (event) => ocr.view(event))
  ipcMain.handle('ocrHelper:ready', (event) => ocr.ready(event))
  ipcMain.handle('ocrHelper:select', (event, value: unknown) => ocr.select(event, value))
  ipcMain.handle('ocrHelper:complete', (event, value: unknown) => ocr.complete(event, value))
  ipcMain.handle('ocrHelper:progress', (event, value: unknown) => ocr.progress(event, value))
  ipcMain.handle('ocrHelper:fail', (event, value: unknown) => ocr.fail(event, value))
  ipcMain.handle('ocrHelper:close', (event) => ocr.close(event))
  ipcMain.handle('ocrHelper:copy', (event) => ocr.copy(event))
}
