import { EventEmitter } from 'node:events'
import { pathToFileURL } from 'node:url'
import type { IpcMainInvokeEvent, WebContents } from 'electron'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const f = await vi.hoisted(async () => ({ windows: [] as any[], capture: vi.fn(), crop: vi.fn(), copy: vi.fn(), trust: vi.fn(), handlers: new Map<string, any>(), ocr: null as any, screen: new (await import('node:events')).EventEmitter(), nextId: 1, prepare: vi.fn(), fetch: vi.fn(), network: vi.fn() }))
vi.mock('./branding', () => ({ resourcePath: () => '/fixture/ocr-helper.html', appWindowIcon: () => '/fixture/icon.ico' }))
vi.mock('./env', () => ({ is: { dev: false } }))
vi.mock('./screen-snapshot', () => ({ captureDesktopFrames: f.capture }))
vi.mock('./ipc-trust', () => ({ assertTrustedIpc: f.trust, isRendererUrl: (a: string, b: string) => a === b }))
vi.mock('electron', () => ({
  app: { isPackaged: true },
  BrowserWindow: class extends EventEmitter {
    destroyed = false; webContents: any
    constructor(public options: any) {
      super(); this.webContents = Object.assign(new EventEmitter(), { id: f.nextId++, mainFrame: { url: '' }, setWindowOpenHandler: vi.fn() }); f.windows.push(this)
    }
    loadURL = vi.fn(async (url: string) => { this.webContents.mainFrame.url = url; f.ocr.ready(event(this)) })
    show = vi.fn(); showInactive = vi.fn(); focus = vi.fn(); setMenu = vi.fn(); setAlwaysOnTop = vi.fn(); setVisibleOnAllWorkspaces = vi.fn()
    isDestroyed() { return this.destroyed }
    getBounds() { return this.options }
    destroy() { this.destroyed = true; this.emit('closed') }
  },
  screen: Object.assign(f.screen, { getCursorScreenPoint: () => ({ x: 10, y: 10 }), getPrimaryDisplay: () => ({ bounds: { x: 0, y: 0 } }), getDisplayNearestPoint: () => ({ bounds: { x: 0, y: 0 } }) }),
  nativeImage: { createFromDataURL: () => ({ getSize: () => ({ width: 3840, height: 2160 }), crop: (rect: unknown) => { f.crop(rect); return { toPNG: () => Buffer.from([137, 80, 78, 71]) } } }) },
  session: { fromPartition: () => ({ protocol: { handle: f.prepare }, setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn(), webRequest: { onBeforeRequest: f.network }, clearCache: () => Promise.resolve() }) },
  net: { fetch: f.fetch }, clipboard: { writeText: f.copy }, dialog: { showMessageBox: vi.fn().mockResolvedValue({}) },
  ipcMain: { handle: (name: string, fn: unknown) => f.handlers.set(name, fn) }
}))
import { DesktopOcr, registerOcrIpc } from './ocr'
function png(width: number, height: number): Uint8Array { const bytes = new Uint8Array(24); bytes.set([137, 80, 78, 71, 13, 10, 26, 10]); new DataView(bytes.buffer).setUint32(16, width); new DataView(bytes.buffer).setUint32(20, height); return bytes }
const bytes = png(100, 100)
const output = { text: 'DevFusion OCR', pages: 1, ocrPages: 1, confidence: 94 }
const frames = [{ bounds: { x: -1920, y: 0, width: 1920, height: 1080 }, image: 'data:image/png;base64,' + Buffer.from(png(3840, 2160)).toString('base64') }, { bounds: { x: 0, y: 0, width: 1920, height: 1080 }, image: 'data:image/png;base64,' + Buffer.from(png(3840, 2160)).toString('base64') }]
function event(win: any): IpcMainInvokeEvent { return { sender: win.webContents, senderFrame: win.webContents.mainFrame } as IpcMainInvokeEvent }
function owner(): WebContents { return Object.assign(new EventEmitter(), { isDestroyed: () => false, send: vi.fn() }) as unknown as WebContents }
function ocr(): DesktopOcr { return f.ocr = new DesktopOcr() }
const ready = async (index = 0) => { await vi.waitFor(() => expect(f.windows[index]?.show.mock.calls.length + f.windows[index]?.showInactive.mock.calls.length).toBeGreaterThan(0)) }
beforeEach(() => { vi.useRealTimers(); f.windows.length = 0; f.handlers.clear(); f.capture.mockReset().mockResolvedValue(frames); f.copy.mockReset(); f.crop.mockReset(); f.trust.mockReset(); f.prepare.mockClear(); f.fetch.mockReset(); f.network.mockReset() })
afterEach(() => { f.ocr?.dispose(); vi.useRealTimers() })

it('creates no idle renderer, starts on demand and destroys the entire engine renderer on completion', async () => {
  const value = ocr(), source = owner()
  expect(f.windows).toHaveLength(0); expect(f.prepare).not.toHaveBeenCalled()
  const pending = value.recognize({ id: 'job-1', bytes, kind: 'image', language: 'eng' }, source)
  await ready()
  expect(f.windows[0].options.webPreferences).toMatchObject({ sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, partition: 'ocr-transient' })
  expect(f.windows[0].options.icon).toBe('/fixture/icon.ico')
  expect(value.view(event(f.windows[0]))).toMatchObject({ kind: 'run', input: { kind: 'image' } })
  await value.complete(event(f.windows[0]), output)
  expect(await pending).toEqual(output)
  expect(f.windows.every(w => w.destroyed)).toBe(true); expect(value.isBusy()).toBe(false)
  expect(source.listenerCount('destroyed')).toBe(0); expect(f.copy).not.toHaveBeenCalled()
})
it('selects a native-pixel region across all displays then replaces the engine with a lightweight result popup', async () => {
  const value = ocr(), pending = value.capture({ id: 'tray', mode: 'region', language: 'eng+vie' })
  await ready(1)
  const rect = { x: .1, y: .2, width: .5, height: .3 }
  await expect(value.select(event(f.windows[0]), { rect, bytes })).rejects.toThrow('dimensions do not match')
  await value.select(event(f.windows[0]), { rect, bytes: png(1920, 648) })
  expect(f.crop).not.toHaveBeenCalled()
  expect(value.view(event(f.windows[2]))).toMatchObject({ kind: 'run', input: { bytes: png(1920, 648) } })
  expect(f.windows.slice(0, 2).every(w => w.destroyed)).toBe(true)
  await value.complete(event(f.windows[2]), output)
  expect(await pending).toEqual(output); expect(f.windows[2].destroyed).toBe(true)
  const popup = f.windows[3]
  expect(value.view(event(popup))).toEqual({ kind: 'result', result: output })
  expect(popup.webContents.mainFrame.url).toBe(pathToFileURL('/fixture/ocr-helper.html').href)
  expect(f.copy).not.toHaveBeenCalled()
  f.copy.mockResolvedValueOnce(undefined)
  await value.copy(event(popup)); expect(f.copy).toHaveBeenCalledWith(output.text)
  f.copy.mockRejectedValueOnce(new Error('Async clipboard failure'))
  await expect(value.copy(event(popup))).rejects.toThrow('Async clipboard failure')
  value.close(event(popup)); expect(f.windows.every(w => w.destroyed)).toBe(true)
})
it('cancel validates request ownership, invalidates late capture and releases all listeners', async () => {
  let finish!: (frames: any[]) => void
  f.capture.mockImplementation(() => new Promise(ok => { finish = ok }))
  const value = ocr(), source = owner(), pending = value.capture({ id: 'job', mode: 'screen', language: 'vie' }, source)
  expect(value.cancel('other-job', source)).toBe(false); expect(value.cancel('job', owner())).toBe(false)
  expect(value.cancel('job', source)).toBe(true); expect(await pending).toBeNull()
  finish(frames); await Promise.resolve(); expect(f.windows).toHaveLength(0)
  expect(f.screen.listenerCount('display-added')).toBe(0)
  expect(source.listenerCount('destroyed')).toBe(0)
})
it('refuses competing jobs, untrusted or stale helpers and malformed output/progress', async () => {
  const value = ocr(), source = owner(), pending = value.recognize({ id: 'a', bytes, kind: 'image', language: 'eng' }, source)
  await ready(); const e = event(f.windows[0])
  expect(() => value.recognize({ id: 'b', bytes, kind: 'image', language: 'eng' }, source)).toThrow('already running')
  expect(() => value.view({ ...e, senderFrame: { url: e.senderFrame!.url } } as any)).toThrow('active OCR')
  expect(() => value.view({ ...e, sender: { id: 9999 } } as any)).toThrow('active OCR')
  expect(() => value.progress(e, { stage: 'x', page: 1, total: 1, percent: Infinity })).toThrow()
  await expect(value.complete(e, { ...output, text: 'x'.repeat(2_000_001) })).rejects.toThrow()
  value.progress(e, { stage: 'Recognizing', page: 1, total: 1, percent: 50 })
  expect(source.send).toHaveBeenCalledWith('ocr:progress', expect.objectContaining({ id: 'a', percent: 50 }))
  source.emit('destroyed'); expect(await pending).toBeNull()
  expect(() => value.copy(e)).toThrow('active OCR')
  registerOcrIpc(value); f.trust.mockImplementation(() => { throw new Error('Untrusted') })
  expect(() => f.handlers.get('ocr:recognize')({}, {})).toThrow('Untrusted')
})
it('capture permissions and processing failures reject cleanly, while display changes cancel selection', async () => {
  const value = ocr()
  f.capture.mockRejectedValueOnce(new Error('Permission denied'))
  await expect(value.capture({ id: 'a', mode: 'screen', language: 'eng' })).rejects.toThrow('Permission denied')
  const pending = value.capture({ id: 'b', mode: 'region', language: 'eng' }); await ready(1)
  f.screen.emit('display-metrics-changed'); expect(await pending).toBeNull()
  const processing = value.recognize({ id: 'c', bytes, kind: 'image', language: 'eng' }, owner()); await ready(2)
  value.fail(event(f.windows[2]), 'Damaged PDF'); await expect(processing).rejects.toThrow('Damaged PDF')
  expect(f.windows.every(w => w.destroyed)).toBe(true)
})
it('bounds hanging native capture with a five-minute deadline', async () => {
  vi.useFakeTimers(); f.capture.mockImplementation(() => new Promise(() => {}))
  const pending = ocr().capture({ id: 'timeout', mode: 'screen', language: 'eng' })
  const rejection = expect(pending).rejects.toThrow('five minutes')
  await vi.advanceTimersByTimeAsync(300000); await rejection
  expect(f.ocr.isBusy()).toBe(false)
})
it('serves only shipped local assets, refuses traversal/malformed URLs and blocks external HTTP', async () => {
  const value = ocr(), source = owner(), pending = value.recognize({ id: 'assets', bytes, kind: 'image', language: 'eng' }, source)
  await ready()
  const handler = f.prepare.mock.calls[0][1]
  for (const url of ['devfusion-ocr://evil/ocr.html', 'devfusion-ocr://local/index.html', 'devfusion-ocr://local/ocr-assets/%2e%2e%2findex.html', 'devfusion-ocr://local/ocr-assets/%5csecret', 'devfusion-ocr://local/ocr-assets/%invalid', 'devfusion-ocr://local/ocr-assets/%00secret']) expect(handler({ url }).status).toBe(404)
  expect(f.fetch).not.toHaveBeenCalled()
  handler({ url: 'devfusion-ocr://local/ocr-assets/eng.traineddata.gz' })
  expect(f.fetch).toHaveBeenCalledWith(expect.stringMatching(/renderer\/ocr-assets\/eng\.traineddata\.gz$/))
  const network = f.network.mock.calls[0][1], response = vi.fn()
  network({ url: 'https://cdn.example.com/model.gz' }, response)
  expect(response).toHaveBeenCalledWith({ cancel: true })
  value.cancel('assets', source); await pending
})
it('rejects an oversized whole-screen snapshot before starting a decoder/engine and respects color-picker exclusion', async () => {
  const value = ocr()
  f.capture.mockResolvedValueOnce([{ bounds: frames[1].bounds, image: 'data:image/png;base64,' + Buffer.from(png(5000, 4000)).toString('base64') }])
  await expect(value.capture({ id: 'large-screen', mode: 'screen', language: 'eng' })).rejects.toThrow('16 million pixels')
  expect(f.windows).toHaveLength(0); expect(f.prepare).not.toHaveBeenCalled()
  const guarded = new DesktopOcr(() => {}, () => false)
  expect(() => guarded.recognize({ id: 'guarded', bytes, kind: 'image', language: 'eng' }, owner())).toThrow('Finish picking')
})
