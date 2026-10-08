import { EventEmitter } from 'events'
import { dialog, type BrowserWindow } from 'electron'
import { beforeEach, expect, it, vi } from 'vitest'
import type { ScreenColorPicker } from './color-picker'
import type { DesktopOcr } from './ocr'
import type { MockApiServer } from './mock-api-server'
import { QUICK_TOOLS } from '@shared/quick-actions'
import type { LanguageState } from '@shared/i18n/locales'
import { DEFAULT_GLOBAL_BINDINGS } from '@shared/quick-tools'
import { DEFAULT_CLIPBOARD } from '@shared/clipboard/types'

const fixture = vi.hoisted(() => ({ tray: null as any, menu: [] as any[], clipboard: vi.fn(), empty: false }))
vi.mock('./menu-icons', () => ({ menuIcon: (name: string) => 'icon:' + name }))
vi.mock('./branding', () => ({ resourcePath: (name: string) => '/fixture/' + name }))
vi.mock('electron', () => ({
  Tray: class extends EventEmitter {
    destroyed = false
    constructor() { super(); fixture.tray = this }
    setToolTip = vi.fn(); setContextMenu = vi.fn(); popUpContextMenu = vi.fn()
    isDestroyed() { return this.destroyed }
    destroy() { this.destroyed = true }
  },
  nativeImage: { createFromPath: () => ({ isEmpty: () => fixture.empty, setTemplateImage: vi.fn() }) },
  Menu: { buildFromTemplate: (items: any[]) => { fixture.menu = items; return items } },
  clipboard: { writeText: fixture.clipboard }, dialog: { showMessageBox: vi.fn().mockResolvedValue({ response: 0 }) }
}))
import { DesktopTray } from './tray'

function windowFixture(): BrowserWindow {
  const win = Object.assign(new EventEmitter(), { destroyed: false, webContents: Object.assign(new EventEmitter(), { send: vi.fn(), isLoading: () => false }), isMinimized: () => false, isDestroyed: () => win.destroyed, show: vi.fn(), focus: vi.fn(), restore: vi.fn() })
  return win as unknown as BrowserWindow
}
function pickerFixture(): ScreenColorPicker {
  return { getLast: () => null, isBusy: () => false, pickFromTray: vi.fn(), dispose: vi.fn() } as unknown as ScreenColorPicker
}
const items = (): any[] => { const flatten = (menu: any[]): any[] => menu.flatMap(item => [item, ...(Array.isArray(item.submenu) ? flatten(item.submenu) : [])]); return flatten(fixture.menu) }
beforeEach(() => { fixture.menu = []; fixture.tray = null; fixture.empty = false; fixture.clipboard.mockReset() })
it('creates only a native tray when idle and generates UUID without a renderer', () => {
  const create = vi.fn(() => windowFixture()), desktop = new DesktopTray(create, pickerFixture(), vi.fn())
  expect(desktop.start()).toBe(true); expect(create).not.toHaveBeenCalled()
  items().find((item) => item.label === 'Copy new UUID').click()
  expect(fixture.clipboard.mock.calls[0][0]).toMatch(/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/)
  expect(create).not.toHaveBeenCalled()
  expect(items().find((item) => item.label === 'Open tool').submenu.map((item: any) => item.label)).toEqual(QUICK_TOOLS.map((tool) => tool.name))
  desktop.dispose(); expect(desktop.hasTray()).toBe(false)
})
it('handles async clipboard rejection with generic feedback and no new renderer', async () => {
  const create = vi.fn(() => windowFixture()), desktop = new DesktopTray(create, pickerFixture(), vi.fn())
  desktop.start()
  vi.mocked(dialog.showMessageBox).mockClear()
  fixture.clipboard.mockRejectedValueOnce(new Error('private failure content'))
  items().find((item) => item.label === 'Copy new UUID').click()
  await vi.waitFor(() => expect(dialog.showMessageBox).toHaveBeenCalledOnce())
  expect(JSON.stringify(vi.mocked(dialog.showMessageBox).mock.calls)).not.toContain('private failure content')
  expect(create).not.toHaveBeenCalled()
  desktop.dispose()
})
it('reuses one window, asks its router to navigate, and recreates only after close', () => {
  const windows: BrowserWindow[] = []
  const create = vi.fn(() => { const win = windowFixture(); windows.push(win); return win })
  const desktop = new DesktopTray(create, pickerFixture(), vi.fn())
  desktop.open('design.color')
  expect(create).toHaveBeenCalledWith('/tool/design.color')
  desktop.open('json.studio')
  expect(create).toHaveBeenCalledTimes(1)
  expect(windows[0].webContents.send).toHaveBeenCalledWith('app:openTool', 'json.studio')
  desktop.open()
  expect(windows[0].webContents.send).toHaveBeenCalledTimes(1)
  windows[0].emit('closed')
  desktop.open()
  expect(create).toHaveBeenCalledTimes(2); expect(create).toHaveBeenLastCalledWith('/')
})
it('does not create a window for screen picking or last-color copy and handles missing native tray', () => {
  const create = vi.fn(() => windowFixture()), picker = pickerFixture()
  vi.spyOn(picker, 'getLast').mockReturnValue('#AABBCC')
  const quit = vi.fn(), desktop = new DesktopTray(create, picker, quit)
  desktop.start()
  items().find((item) => item.label?.startsWith('Pick screen')).click()
  items().find((item) => item.label?.startsWith('Copy last color')).click()
  expect(picker.pickFromTray).toHaveBeenCalled(); expect(fixture.clipboard).toHaveBeenCalledWith('#AABBCC')
  expect(create).not.toHaveBeenCalled()
  items().find((item) => item.label === 'Quit DevFusion').click(); expect(quit).toHaveBeenCalled()
  desktop.dispose()
  fixture.empty = true
  expect(new DesktopTray(create, picker, quit).start()).toBe(false)
})
it('starts screen/region OCR directly from the tray and disposes it without loading the main app', () => {
  const create = vi.fn(() => windowFixture()), ocr = { isBusy: () => false, captureFromTray: vi.fn(), dispose: vi.fn() }
  const desktop = new DesktopTray(create, pickerFixture(), vi.fn(), ocr as unknown as DesktopOcr)
  desktop.start()
  const menu = items().find((item) => item.label === 'Extract text (OCR)')
  menu.submenu[0].click(); menu.submenu[1].click()
  expect(ocr.captureFromTray.mock.calls.map(call => call[0])).toEqual(['region', 'screen'])
  expect(create).not.toHaveBeenCalled()
  vi.spyOn(ocr, 'isBusy').mockReturnValue(true); desktop.refresh()
  expect(items().find(item => item.label === 'Extract text (OCR)').enabled).toBe(false)
  expect(items().find(item => item.label === 'Pick screen color…').enabled).toBe(false)
  desktop.dispose(); expect(ocr.dispose).toHaveBeenCalled()
})
it('shows a running Mock API and stops it from the tray without creating a renderer', async () => {
  const create = vi.fn(() => windowFixture())
  const server = { status: vi.fn(() => ({ running: true, port: 4010, baseUrl: 'http://127.0.0.1:4010' })), stop: vi.fn().mockResolvedValue({ running: false }) }
  const desktop = new DesktopTray(create, pickerFixture(), vi.fn(), undefined, server as unknown as MockApiServer)
  desktop.start()
  const menu = items().find((item) => item.label === 'Mock API · 4010')
  menu.submenu.find((item: any) => item.label === 'Stop server').click()
  expect(server.stop).toHaveBeenCalledOnce(); expect(create).not.toHaveBeenCalled()
  server.status.mockReturnValue({ running: false, port: null as unknown as number, baseUrl: null as unknown as string })
  desktop.refresh()
  expect(items().find((item) => item.label === 'Mock API · Stopped').submenu.find((item: any) => item.label === 'Stop server').enabled).toBe(false)
  menu.submenu.find((item: any) => item.label === 'Mock API').click()
  expect(create).toHaveBeenCalledWith('/tool/network.mock-api')
  desktop.dispose()
})
it('shares language preferences with the app and offers settings and manual vault lock', async () => {
  let language: LanguageState = { language: 'vi', resolved: 'vi' }, unlocked = true
  const create = vi.fn(() => windowFixture()), lock = vi.fn(() => { unlocked = false })
  const desktop = new DesktopTray(create, pickerFixture(), vi.fn(), undefined, undefined, {
    language: () => language, setLanguage: async value => { language = { language: value, resolved: value === 'system' ? 'en' : value }; desktop.refresh() }, vaultUnlocked: () => unlocked, lockVault: lock
  })
  desktop.start()
  expect(items().find(item => item.label === 'Mở DevFusion')).toBeDefined()
  const languages = items().find(item => item.label === 'Ngôn ngữ').submenu
  expect(languages.filter((item: any) => item.type === 'radio')).toHaveLength(14)
  expect(languages.find((item: any) => item.label === 'Tiếng Việt').checked).toBe(true)
  items().find(item => item.label === 'Cài đặt').click()
  expect(create).toHaveBeenCalledWith('/tool/app.settings')
  items().find(item => item.label === 'English').click()
  await vi.waitFor(() => expect(language.language).toBe('en'))
  items().find(item => item.label === 'Lock Private Box').click()
  expect(lock).toHaveBeenCalledOnce()
  desktop.refresh()
  expect(items().find(item => item.label === 'Lock Private Box').enabled).toBe(false)
  desktop.dispose()
})
it('contains failed picker actions and keeps a working menu if native refresh fails', async () => {
  const picker = pickerFixture(), desktop = new DesktopTray(vi.fn(() => windowFixture()), picker, vi.fn())
  desktop.start()
  vi.mocked(dialog.showMessageBox).mockClear()
  vi.mocked(picker.pickFromTray).mockRejectedValueOnce(new Error('private network detail'))
  items().find(item => item.label === 'Pick screen color…').click()
  await vi.waitFor(() => expect(dialog.showMessageBox).toHaveBeenCalledOnce())
  expect(JSON.stringify(vi.mocked(dialog.showMessageBox).mock.calls)).not.toContain('private network detail')
  fixture.tray.setContextMenu.mockImplementationOnce(() => { throw new Error('shutting down') })
  expect(() => desktop.refresh()).not.toThrow()
  desktop.dispose()
})
it('gives native tool actions icons, displays only registered hotkeys and opens widgets without the main window', () => {
  const create = vi.fn(() => windowFixture()), open = vi.fn().mockResolvedValue(undefined), pause = vi.fn()
  const desktop = new DesktopTray(create, pickerFixture(), vi.fn(), undefined, undefined, undefined, {
    open, pauseClipboard: pause,
    clipboardState: () => ({ preferences: { ...DEFAULT_CLIPBOARD, enabled: true }, paused: false, blocked: null, encryptionAvailable: true, count: 12, bytes: 1200, skipped: 0, error: null }),
    shortcuts: () => ({ bindings: DEFAULT_GLOBAL_BINDINGS, registered: ['clipboard'], failed: [], platform: 'win32' })
  })
  desktop.start()
  for (const label of ['Open DevFusion', 'Quick actions', 'Pick screen color…', 'UUID widget', 'Timestamp widget', 'Quick text transforms', 'Settings', 'Quit DevFusion']) expect(items().find(item => item.label === label).icon).toBeTruthy()
  const clipboard = items().find(item => item.label === 'Clipboard Manager · 12'); expect(clipboard.accelerator).toBe('Control+Shift+Space'); expect(clipboard.registerAccelerator).toBe(false)
  clipboard.click(); items().find(item => item.label === 'UUID widget').click(); expect(open.mock.calls.map(call => call[0])).toEqual(['clipboard', 'random']); expect(create).not.toHaveBeenCalled()
  items().find(item => item.label === 'Pause clipboard capture').click(); expect(pause).toHaveBeenCalledWith(true)
  desktop.dispose()
})
it('routes every tray Open tool action to its standalone widget, including immediate screen color picking', () => {
  const create = vi.fn(() => windowFixture()), open = vi.fn().mockResolvedValue(undefined)
  const desktop = new DesktopTray(create, pickerFixture(), vi.fn(), undefined, undefined, undefined, {
    open, pauseClipboard: vi.fn(), clipboardState: () => ({ preferences: DEFAULT_CLIPBOARD, paused: false, blocked: null, encryptionAvailable: true, count: 0, bytes: 0, skipped: 0, error: null }), shortcuts: () => ({ bindings: DEFAULT_GLOBAL_BINDINGS, registered: ['clipboard'], failed: [], platform: 'win32' })
  })
  desktop.start()
  const tools = items().find(item => item.label === 'Open tool').submenu
  for (const tool of tools) { expect(tool.icon).toBeTruthy(); tool.click() }
  expect(open.mock.calls.map(call => call[0])).toEqual(QUICK_TOOLS.map(tool => tool.widget)); expect(create).not.toHaveBeenCalled()
  items().find(item => item.label === 'Pick screen color…').click(); expect(open).toHaveBeenLastCalledWith('color'); expect(create).not.toHaveBeenCalled()
  desktop.dispose()
})
