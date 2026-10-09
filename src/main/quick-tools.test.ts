import { EventEmitter } from 'node:events'
import { beforeEach, expect, it, vi } from 'vitest'
import type { IpcMainInvokeEvent } from 'electron'
import type { ClipboardManager } from './clipboard/service'
import type { ScreenColorPicker } from './color-picker'
import type { DesktopOcr } from './ocr'
import type { GlobalShortcuts } from './global-shortcuts'
import type { MockApiServer } from './mock-api-server'
const f = vi.hoisted(() => ({ windows: [] as any[], handlers: new Map<string, (...args: any[]) => any>(), next: 1, captureTarget: vi.fn(), pasteTarget: vi.fn() }))
vi.mock('./platform/clipboard-paste', () => ({ DesktopPaste: class { capture = f.captureTarget; paste = f.pasteTarget } }))
vi.mock('./branding', () => ({ appWindowIcon: () => '/fixture/devfusion.ico' }))
vi.mock('./env', () => ({ is: { dev: false } }))
vi.mock('./ipc-trust', () => ({ assertTrustedIpc: (event: any) => { if (event.sender.id !== 900 || event.senderFrame !== event.sender.mainFrame) throw new Error('Untrusted app') }, isRendererUrl: (actual: string, expected: string) => actual === expected }))
vi.mock('electron', () => ({
  app: { isPackaged: true },
  ipcMain: { handle: (name: string, fn: any) => f.handlers.set(name, fn) }, nativeTheme: { shouldUseDarkColors: true },
  screen: { getPrimaryDisplay: () => ({ workArea: { x: -800, y: 40, width: 800, height: 600 } }), getCursorScreenPoint: () => ({ x: -100, y: 100 }), getDisplayNearestPoint: () => ({ workArea: { x: -800, y: 40, width: 800, height: 600 } }) },
  BrowserWindow: class extends EventEmitter {
    destroyed = false; webContents: any
    constructor(public options: any) { super(); this.webContents = Object.assign(new EventEmitter(), { id: f.next++, mainFrame: { url: '' }, session: { setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn(), setDevicePermissionHandler: vi.fn(), webRequest: { onBeforeRequest: vi.fn() } }, setWindowOpenHandler: vi.fn(), send: vi.fn() }); f.windows.push(this) }
    loadURL = vi.fn(async (url: string) => { this.webContents.mainFrame.url = url }); setMenu = vi.fn(); setAlwaysOnTop = vi.fn(); show = vi.fn(); hide = vi.fn(); focus = vi.fn()
    isDestroyed() { return this.destroyed } destroy() { this.destroyed = true; this.emit('closed') }
  }
}))
import { QuickTools } from './quick-tools'
const event = (win: any): IpcMainInvokeEvent => ({ sender: win.webContents, senderFrame: win.webContents.mainFrame }) as IpcMainInvokeEvent
beforeEach(() => { f.windows.length = 0; f.handlers.clear(); f.captureTarget.mockReset().mockResolvedValue({ windowId: '123', pid: 100 }); f.pasteTarget.mockReset().mockResolvedValue(undefined) })
function fixture(): { quick: QuickTools; clipboard: any; picker: any; ocr: any } {
  const clipboard = { state: vi.fn(() => ({ blocked: null })), visibilityRevision: vi.fn(() => 0), list: vi.fn(() => []), content: vi.fn(() => ({ text: 'fixture' })), copy: vi.fn().mockResolvedValue(undefined), copyText: vi.fn().mockResolvedValue(undefined), copyImage: vi.fn().mockResolvedValue(undefined) }
  const picker = { isBusy: vi.fn(() => false), pickFromTray: vi.fn().mockResolvedValue(undefined) }, ocr = { isBusy: vi.fn(() => false), captureFromTray: vi.fn().mockResolvedValue(undefined), recognize: vi.fn().mockResolvedValue({ text: 'fixture', pages: 1, ocrPages: 1 }), cancel: vi.fn() }
  const quick = new QuickTools(clipboard as unknown as ClipboardManager, picker as unknown as ScreenColorPicker, ocr as unknown as DesktopOcr, () => 'vi')
  quick.register({ state: () => ({}) } as GlobalShortcuts)
  return { quick, clipboard, picker, ocr }
}
it('allocates no idle renderer, confines a branded widget to the chosen work area and destroys it on blur', async () => {
  const { quick } = fixture(); expect(f.windows).toHaveLength(0)
  await quick.open('clipboard'); const win = f.windows[0]
  expect(win.options).toMatchObject({ icon: '/fixture/devfusion.ico', width: 620, height: 600, x: -710, y: 40, webPreferences: { sandbox: true, contextIsolation: true, webSecurity: true, nodeIntegration: false, partition: 'quick-tools' } })
  expect(quick.context(event(win))).toEqual({ kind: 'clipboard', locale: 'vi', dark: true, canPaste: true })
  await quick.open('clipboard'); expect(f.windows).toHaveLength(1)
  win.emit('blur'); expect(win.destroyed).toBe(true)
})
it('starts the eyedropper immediately without an intermediate widget and closes an existing widget before capture', async () => {
  const { quick, picker, ocr } = fixture()
  await quick.open('color'); expect(f.windows).toHaveLength(0); expect(picker.pickFromTray).toHaveBeenCalledOnce()
  await quick.open('clipboard'); const win = f.windows[0]
  picker.isBusy.mockReturnValue(true); await expect(quick.open('color')).rejects.toThrow('Finish or cancel'); expect(win.destroyed).toBe(false)
  picker.isBusy.mockReturnValue(false); ocr.isBusy.mockReturnValue(true); await expect(quick.open('color')).rejects.toThrow('Finish or cancel'); expect(win.destroyed).toBe(false)
  ocr.isBusy.mockReturnValue(false); await quick.open('color'); expect(win.destroyed).toBe(true); expect(f.windows).toHaveLength(1); expect(picker.pickFromTray).toHaveBeenCalledTimes(2)
})

it('refuses a burst of window creation until the current widget has loaded', async () => {
  const { quick } = fixture()
  const first = quick.open('clipboard')
  await expect(quick.open('timestamp')).rejects.toThrow('opening')
  await Promise.resolve()
  expect(f.windows).toHaveLength(1)
  await first
  await quick.open('timestamp')
  expect(f.windows).toHaveLength(2)
  expect(f.windows[0].destroyed).toBe(true)
  quick.close()
})
it('captures the target before opening, restores it only after copy and preserves it when switching widgets', async () => {
  const { quick, clipboard } = fixture()
  await quick.open('clipboard'); const win = f.windows[0], e = event(win)
  expect(f.captureTarget).toHaveBeenCalledOnce()
  await quick.open('json'); expect(f.captureTarget).toHaveBeenCalledOnce()
  await quick.open('clipboard'); const current = f.windows.at(-1), currentEvent = event(current)
  await f.handlers.get('clipboard:paste')!(currentEvent, 'entry', 'original')
  expect(clipboard.copy).toHaveBeenCalledWith('entry', 'original')
  expect(current.hide).toHaveBeenCalledOnce()
  expect(f.pasteTarget).toHaveBeenCalledWith({ windowId: '123', pid: 100 })
  expect(current.destroyed).toBe(true)
  expect(() => f.handlers.get('clipboard:paste')!(e, 'entry', 'original')).toThrow('active quick')
})
it('keeps clipboard available on paste failure, refuses missing targets and rechecks identity after copy', async () => {
  const { quick, clipboard } = fixture(); await quick.open('clipboard'); const win = f.windows[0], e = event(win)
  f.pasteTarget.mockRejectedValueOnce(new Error('target closed'))
  await expect(f.handlers.get('clipboard:pasteText')!(e, 'fixture')).rejects.toThrow('target closed')
  expect(win.destroyed).toBe(false); expect(win.show).toHaveBeenCalledTimes(2)
  clipboard.copy.mockRejectedValueOnce(new Error('write failed'))
  await expect(f.handlers.get('clipboard:paste')!(e, 'entry', 'original')).rejects.toThrow('write failed')
  expect(f.pasteTarget).toHaveBeenCalledOnce()
  clipboard.copy.mockImplementationOnce(async () => { clipboard.visibilityRevision.mockReturnValue(1) })
  await expect(f.handlers.get('clipboard:paste')!(e, 'entry', 'original')).rejects.toThrow('access changed')
  expect(f.pasteTarget).toHaveBeenCalledOnce()
  quick.close(); f.captureTarget.mockResolvedValueOnce(null); await quick.open('clipboard')
  await expect(f.handlers.get('clipboard:pasteText')!(event(f.windows.at(-1)), 'fixture')).rejects.toThrow('global shortcut')
})
it('refreshes a pinned clipboard target on reopening from another app and starts the helper before hiding', async () => {
  const { quick } = fixture(); await quick.open('clipboard'); const win = f.windows[0]
  quick.pin(true); f.captureTarget.mockResolvedValueOnce({ windowId: '456', pid: 200 })
  await quick.open('clipboard')
  f.pasteTarget.mockImplementationOnce(async target => {
    expect(target).toEqual({ windowId: '456', pid: 200 }); expect(win.hide).not.toHaveBeenCalled()
  })
  await f.handlers.get('clipboard:pasteText')!(event(win), 'fixture')
  expect(win.destroyed).toBe(true)
})
it('runs clipboard OCR hidden for either trusted UI and discards stale results after privacy changes', async () => {
  const { quick, clipboard, ocr } = fixture(); clipboard.content.mockReturnValue({ text: '', png: 'fixture-png' })
  await quick.open('clipboard'); const win = f.windows[0], e = event(win)
  await expect(f.handlers.get('clipboard:ocr')!(e, 'image')).resolves.toBe('fixture')
  expect(ocr.recognize).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'image', language: 'eng+vie' }), e.sender, false)
  const app = { sender: { id: 900, mainFrame: {} } } as any; app.senderFrame = app.sender.mainFrame
  await expect(f.handlers.get('clipboard:ocr')!(app, 'image')).resolves.toBe('fixture')
  expect(ocr.recognize).toHaveBeenLastCalledWith(expect.anything(), app.sender, false)
  ocr.recognize.mockImplementationOnce(async () => { clipboard.visibilityRevision.mockReturnValue(2); return { text: 'stale' } })
  await expect(f.handlers.get('clipboard:ocr')!(e, 'image')).resolves.toBeNull()
  quick.close()
})
it('confines image copy and OCR commands to the current widget and preserves pinning during OCR work', async () => {
  const { quick, clipboard, ocr } = fixture(); await quick.open('ocr'); const win = f.windows[0], e = event(win)
  expect(() => f.handlers.get('quick:copyImage')!({ ...e, senderFrame: { url: '' } }, 'fake')).toThrow('active quick')
  await f.handlers.get('quick:copyImage')!(e, 'fixture-png'); expect(clipboard.copyImage).toHaveBeenCalledWith('fixture-png')
  let resolve!: (value: any) => void; ocr.recognize.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const pending = f.handlers.get('quick:ocr')!(e, { id: 'ocr-fixture' }); win.emit('blur'); expect(win.destroyed).toBe(false)
  resolve({ text: 'finished', pages: 1, ocrPages: 1 }); await pending; win.emit('blur'); expect(win.destroyed).toBe(true)
})
it('keeps the active widget for a busy or invalid OCR action, then switches straight to region capture', async () => {
  const { quick, picker, ocr } = fixture(); await quick.open('clipboard'); const win = f.windows[0]
  await expect(quick.capture('https://example.com')).rejects.toThrow('screen or region'); expect(win.destroyed).toBe(false)
  picker.isBusy.mockReturnValue(true); await expect(quick.capture('region')).rejects.toThrow('Finish or cancel'); expect(win.destroyed).toBe(false)
  picker.isBusy.mockReturnValue(false); await quick.capture('region'); expect(win.destroyed).toBe(true); expect(ocr.captureFromTray).toHaveBeenCalledWith('region'); expect(f.windows).toHaveLength(1)
})
it('preserves manual pinning during OCR and keeps an active job alive when a second OCR call is refused', async () => {
  const { quick, ocr } = fixture(); await quick.open('ocr'); const win = f.windows[0], e = event(win)
  let resolve!: (value: any) => void; ocr.recognize.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const pending = f.handlers.get('quick:ocr')!(e, { id: 'first' })
  ocr.recognize.mockRejectedValueOnce(new Error('OCR is already running.'))
  await expect(f.handlers.get('quick:ocr')!(e, { id: 'second' })).rejects.toThrow('already running')
  win.emit('blur'); expect(win.destroyed).toBe(false)
  f.handlers.get('quick:pin')!(e, true); resolve(null); await pending; win.emit('blur'); expect(win.destroyed).toBe(false)
  f.handlers.get('quick:pin')!(e, false); win.emit('blur'); expect(win.destroyed).toBe(true)
})
it('allows only the active widget to control the existing Mock API and bounds UTF-8 YAML before delegation', async () => {
  const { clipboard, picker, ocr } = fixture(), mock = { status: vi.fn(() => ({ running: false })), getConfig: vi.fn(() => null), start: vi.fn().mockResolvedValue({ running: true }), stop: vi.fn().mockResolvedValue({ running: false }) }
  const quick = new QuickTools(clipboard as unknown as ClipboardManager, picker as unknown as ScreenColorPicker, ocr as unknown as DesktopOcr, () => 'en', mock as unknown as MockApiServer)
  quick.register({ state: () => ({}) } as GlobalShortcuts); await quick.open('mock'); const e = event(f.windows[0])
  expect(() => f.handlers.get('quick:mockStop')!({ ...e, senderFrame: { url: '' } })).toThrow('active quick'); expect(mock.stop).not.toHaveBeenCalled()
  for (const value of [null, {}, 'a'.repeat(1_048_577), 'ắ'.repeat(400_000)]) expect(() => f.handlers.get('quick:mockStart')!(e, value)).toThrow('at most 1 MiB')
  expect(mock.start).not.toHaveBeenCalled()
  await f.handlers.get('quick:mockStart')!(e, 'version: 1'); expect(mock.start).toHaveBeenCalledWith('version: 1')
  await f.handlers.get('quick:mockStop')!(e); expect(mock.stop).toHaveBeenCalledOnce(); quick.close()
})
it('denies foreign windows/frames/navigation and retains only a deliberately pinned helper', async () => {
  const { quick, clipboard } = fixture(); await quick.open('transform'); const win = f.windows[0], e = event(win)
  expect(() => f.handlers.get('quick:context')!({ ...e, senderFrame: { url: win.webContents.mainFrame.url } })).toThrow('active quick')
  expect(() => f.handlers.get('clipboard:list')!({ sender: { id: 88 } })).toThrow('Untrusted')
  f.handlers.get('quick:pin')!(e, true); win.emit('blur'); expect(win.destroyed).toBe(false)
  expect(() => f.handlers.get('quick:pin')!(e, 'true')).toThrow()
  await f.handlers.get('quick:copyText')!(e, 'manual widget input'); expect(clipboard.copyText).toHaveBeenCalledWith('manual widget input', true)
  await f.handlers.get('clipboard:copyText')!(e, 'safe fixture', true); expect(clipboard.copyText).toHaveBeenCalledWith('safe fixture'); expect(win.destroyed).toBe(true)
  await expect(quick.open('https://example.com')).rejects.toThrow('supported')
})
it('blocks HTTP/WebSocket requests and local files outside bundled renderer resources', async () => {
  const { quick } = fixture(); await quick.open('clipboard'); const win = f.windows[0]
  const [filter, request] = win.webContents.session.webRequest.onBeforeRequest.mock.calls[0]
  expect(filter).toEqual({ urls: ['<all_urls>'] })
  for (const url of ['https://example.com/', 'wss://example.com/socket', 'ws://127.0.0.1:1234/socket', new URL('../outside.txt', win.webContents.mainFrame.url).href]) {
    const done = vi.fn(); request({ url }, done); expect(done).toHaveBeenCalledWith({ cancel: true })
  }
  const done = vi.fn(); request({ url: win.webContents.mainFrame.url }, done); expect(done).toHaveBeenCalledWith({ cancel: false })
  quick.close()
})
