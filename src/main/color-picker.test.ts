import { EventEmitter } from 'events'
import { pathToFileURL } from 'url'
import type { IpcMainInvokeEvent, WebContents } from 'electron'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const fixture = await vi.hoisted(async () => ({ windows: [] as any[], options: [] as any[], capture: vi.fn(), clipboard: vi.fn(), trust: vi.fn(), handlers: new Map<string, any>(), picker: null as any, screen: new (await import('events')).EventEmitter(), nextId: 1 }))
vi.mock('./branding', () => ({ resourcePath: () => '/fixture/color-picker.html' }))
vi.mock('./screen-snapshot', () => ({ captureDesktopFrames: fixture.capture }))
vi.mock('./ipc-trust', () => ({ assertTrustedIpc: fixture.trust, isRendererUrl: (a: string, b: string) => a === b }))
vi.mock('electron', () => ({
  BrowserWindow: class extends EventEmitter {
    destroyed = false
    options: any
    webContents: any
    constructor(options: any) {
      super(); this.options = options
      const mainFrame = { url: pathToFileURL('/fixture/color-picker.html').href }
      this.webContents = Object.assign(new EventEmitter(), { id: fixture.nextId++, mainFrame, setWindowOpenHandler: vi.fn() })
      fixture.windows.push(this); fixture.options.push(options)
    }
    loadFile = vi.fn(async () => { fixture.picker.ready(eventFor(this)) })
    show = vi.fn(); showInactive = vi.fn(); focus = vi.fn()
    setMenu = vi.fn(); setAlwaysOnTop = vi.fn(); setVisibleOnAllWorkspaces = vi.fn()
    getBounds() { return this.options }
    isDestroyed() { return this.destroyed }
    destroy() { if (this.destroyed) throw new Error('Already destroyed'); this.destroyed = true; this.emit('closed') }
  },
  screen: Object.assign(fixture.screen, { getCursorScreenPoint: () => ({ x: -100, y: 100 }), getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }), getDisplayNearestPoint: () => ({ workArea: { x: -1920, y: 0, width: 1920, height: 1080 } }) }),
  clipboard: { writeText: fixture.clipboard }, dialog: { showMessageBox: vi.fn().mockResolvedValue({ response: 0 }) },
  ipcMain: { handle: (name: string, callback: unknown) => fixture.handlers.set(name, callback) }
}))
import { ScreenColorPicker, registerColorPickerIpc } from './color-picker'

function eventFor(win: any): IpcMainInvokeEvent { return { sender: win.webContents, senderFrame: win.webContents.mainFrame } as IpcMainInvokeEvent }
function picker(): ScreenColorPicker { const value = new ScreenColorPicker(); fixture.picker = value; return value }
const frames = [
  { bounds: { x: -1920, y: 0, width: 1920, height: 1080 }, image: 'data:image/png;base64,fixture-left' },
  { bounds: { x: 0, y: 0, width: 2560, height: 1440 }, image: 'data:image/png;base64,fixture-right' }
]
const ready = async () => { await vi.waitFor(() => expect(fixture.windows[0]?.showInactive).toHaveBeenCalled()) }
beforeEach(() => {
  vi.useRealTimers(); fixture.windows.length = 0; fixture.options.length = 0; fixture.handlers.clear()
  fixture.capture.mockReset().mockResolvedValue(frames); fixture.clipboard.mockReset(); fixture.trust.mockReset()
})
afterEach(() => { fixture.picker?.dispose(); vi.useRealTimers() })

it('covers every full desktop display before selecting and shows a format popup without automatic HEX copy', async () => {
  const value = picker(), pending = value.pick()
  await ready()
  expect(fixture.capture).toHaveBeenCalledTimes(1)
  expect(fixture.options.slice(0, 2)).toEqual(expect.arrayContaining(frames.map(frame => expect.objectContaining({ ...frame.bounds, frame: false }))))
  expect(fixture.options[0].webPreferences).toMatchObject({ sandbox: true, contextIsolation: true, webSecurity: true, nodeIntegration: false, partition: 'color-picker' })
  expect(fixture.options[0].webPreferences.preload).toMatch(/colorPicker.js$/)
  await value.select(eventFor(fixture.windows[0]), '#aabbcc')
  expect(await pending).toEqual({ hex: '#AABBCC' })
  expect(fixture.windows.slice(0, 2).every(win => win.destroyed)).toBe(true)
  const popup = fixture.windows[2], view = value.view(eventFor(popup))
  expect(view).toMatchObject({ kind: 'result', color: { hex: '#AABBCC', rgb: 'rgb(170, 187, 204)', hsl: 'hsl(210, 25%, 73%)', hsv: 'hsv(210, 17%, 80%)' } })
  expect(fixture.clipboard).not.toHaveBeenCalled()
  value.copy(eventFor(popup), 'rgb')
  expect(fixture.clipboard).toHaveBeenCalledWith('rgb(170, 187, 204)')
  expect(value.getLast()).toBe('#AABBCC'); expect(value.isBusy()).toBe(false)
  value.close(eventFor(popup)); expect(fixture.windows.every(win => win.destroyed)).toBe(true)
})

it('repick destroys the previous popup, captures again and Esc restores its previous color', async () => {
  const value = picker(), pending = value.pick()
  await ready(); await value.select(eventFor(fixture.windows[0]), '#112233'); await pending
  const popup = fixture.windows[2]
  await value.repick(eventFor(popup))
  expect(popup.destroyed).toBe(true); expect(fixture.capture).toHaveBeenCalledTimes(2)
  await value.cancel(eventFor(fixture.windows[3]))
  expect(fixture.windows.slice(3, 5).every(win => win.destroyed)).toBe(true)
  expect(value.view(eventFor(fixture.windows[5]))).toMatchObject({ kind: 'result', color: { hex: '#112233' } })
  expect(fixture.clipboard).not.toHaveBeenCalled()
  await value.repick(eventFor(fixture.windows[5]))
  await value.select(eventFor(fixture.windows[6]), '#FF8800')
  expect(value.getLast()).toBe('#FF8800')
  expect(fixture.windows.filter(win => !win.destroyed)).toHaveLength(1)
})

it('owner destruction cancels delayed capture and cannot create later windows or copy', async () => {
  let finish!: (value: typeof frames) => void
  fixture.capture.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const owner = Object.assign(new EventEmitter(), { isDestroyed: () => false }) as unknown as WebContents
  const value = picker(), pending = value.pick(owner)
  await expect(value.pick()).rejects.toThrow('already open')
  owner.emit('destroyed'); finish(frames)
  expect(await pending).toBeNull()
  await Promise.resolve()
  expect(fixture.windows).toHaveLength(0); expect(fixture.clipboard).not.toHaveBeenCalled()
  expect(owner.listenerCount('destroyed')).toBe(0); expect(value.isBusy()).toBe(false)
})

it('Esc and display changes cancel without changing clipboard; capture permission errors fail clearly', async () => {
  const value = picker(), pending = value.pick()
  await ready(); await value.cancel(eventFor(fixture.windows[0]))
  expect(await pending).toBeNull(); expect(value.getLast()).toBeNull()
  const changed = value.pick(); await vi.waitFor(() => expect(fixture.windows[2]?.showInactive).toHaveBeenCalled())
  fixture.screen.emit('display-metrics-changed')
  expect(await changed).toBeNull()
  fixture.capture.mockRejectedValueOnce(new Error('Permission denied'))
  await expect(value.pick()).rejects.toThrow('Permission denied')
  expect(fixture.clipboard).not.toHaveBeenCalled()
})

it('refuses foreign windows, subframes, malformed colors, stale helpers and arbitrary copy payloads', async () => {
  const value = picker(), pending = value.pick()
  await ready(); const overlay = fixture.windows[0], event = eventFor(overlay)
  await expect(value.select({ ...event, senderFrame: { url: event.senderFrame!.url } } as any, '#112233')).rejects.toThrow('active color picker')
  await expect(value.select({ ...event, sender: { id: 999 } } as any, '#112233')).rejects.toThrow('active color picker')
  await expect(value.select(event, '#fff;background:red')).rejects.toThrow('Invalid screen color')
  await value.select(event, '#112233'); await pending
  overlay.webContents.emit('render-process-gone')
  expect(fixture.windows[2].destroyed).toBe(false)
  expect(() => value.view(event)).toThrow('active color picker')
  const popup = eventFor(fixture.windows[2])
  expect(() => value.copy(popup, 'arbitrary secret text')).toThrow('Choose HEX')
  fixture.clipboard.mockImplementation(() => { throw new Error('Clipboard unavailable') })
  expect(() => value.copy(popup, 'hsl')).toThrow('Clipboard unavailable')
  expect(value.getLast()).toBe('#112233')
  registerColorPickerIpc(value)
  fixture.trust.mockImplementation(() => { throw new Error('Untrusted frame') })
  expect(() => fixture.handlers.get('color:pickScreen')({ sender: {} })).toThrow('Untrusted frame')
  expect(() => fixture.handlers.get('screenPicker:view')({ sender: { id: 999 } })).toThrow('active color picker')
})

it('releases a hanging capture at the two-minute deadline', async () => {
  vi.useFakeTimers(); fixture.capture.mockImplementation(() => new Promise(() => {}))
  const value = picker(), pending = value.pick()
  await vi.advanceTimersByTimeAsync(120000)
  expect(await pending).toBeNull(); expect(value.isBusy()).toBe(false)
  expect(fixture.screen.listenerCount('display-removed')).toBe(0)
})
