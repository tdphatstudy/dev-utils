import { EventEmitter } from 'events'
import type { BrowserWindow } from 'electron'
import { beforeEach, expect, it, vi } from 'vitest'
import type { ScreenColorPicker } from './color-picker'
import type { DesktopOcr } from './ocr'
import type { MockApiServer } from './mock-api-server'
import { QUICK_TOOLS } from '@shared/quick-actions'

const fixture = vi.hoisted(() => ({ tray: null as any, menu: [] as any[], clipboard: vi.fn(), empty: false }))
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
beforeEach(() => { fixture.menu = []; fixture.tray = null; fixture.empty = false; fixture.clipboard.mockReset() })
it('creates only a native tray when idle and generates UUID without a renderer', () => {
  const create = vi.fn(() => windowFixture()), desktop = new DesktopTray(create, pickerFixture(), vi.fn())
  expect(desktop.start()).toBe(true); expect(create).not.toHaveBeenCalled()
  fixture.menu.find((item) => item.label === 'Copy new UUID').click()
  expect(fixture.clipboard.mock.calls[0][0]).toMatch(/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/)
  expect(create).not.toHaveBeenCalled()
  expect(fixture.menu.find((item) => item.label === 'Open tool').submenu.map((item: any) => item.label)).toEqual(QUICK_TOOLS.map((tool) => tool.name))
  desktop.dispose(); expect(desktop.hasTray()).toBe(false)
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
  fixture.menu.find((item) => item.label?.startsWith('Pick screen')).click()
  fixture.menu.find((item) => item.label?.startsWith('Copy last color')).click()
  expect(picker.pickFromTray).toHaveBeenCalled(); expect(fixture.clipboard).toHaveBeenCalledWith('#AABBCC')
  expect(create).not.toHaveBeenCalled()
  fixture.menu.find((item) => item.label === 'Quit DevFusion').click(); expect(quit).toHaveBeenCalled()
  desktop.dispose()
  fixture.empty = true
  expect(new DesktopTray(create, picker, quit).start()).toBe(false)
})
it('starts screen/region OCR directly from the tray and disposes it without loading the main app', () => {
  const create = vi.fn(() => windowFixture()), ocr = { isBusy: () => false, captureFromTray: vi.fn(), dispose: vi.fn() }
  const desktop = new DesktopTray(create, pickerFixture(), vi.fn(), ocr as unknown as DesktopOcr)
  desktop.start()
  const menu = fixture.menu.find((item) => item.label === 'Extract text (OCR)')
  menu.submenu[0].click(); menu.submenu[1].click()
  expect(ocr.captureFromTray.mock.calls.map(call => call[0])).toEqual(['region', 'screen'])
  expect(create).not.toHaveBeenCalled()
  vi.spyOn(ocr, 'isBusy').mockReturnValue(true); desktop.refresh()
  expect(fixture.menu.find(item => item.label === 'Extract text (OCR)').enabled).toBe(false)
  expect(fixture.menu.find(item => item.label === 'Pick screen color…').enabled).toBe(false)
  desktop.dispose(); expect(ocr.dispose).toHaveBeenCalled()
})
it('shows a running Mock API and stops it from the tray without creating a renderer', async () => {
  const create = vi.fn(() => windowFixture())
  const server = { status: vi.fn(() => ({ running: true, port: 4010, baseUrl: 'http://127.0.0.1:4010' })), stop: vi.fn().mockResolvedValue({ running: false }) }
  const desktop = new DesktopTray(create, pickerFixture(), vi.fn(), undefined, server as unknown as MockApiServer)
  desktop.start()
  const menu = fixture.menu.find((item) => item.label === 'Mock API · port 4010')
  menu.submenu.find((item: any) => item.label === 'Stop server').click()
  expect(server.stop).toHaveBeenCalledOnce(); expect(create).not.toHaveBeenCalled()
  server.status.mockReturnValue({ running: false, port: null as unknown as number, baseUrl: null as unknown as string })
  desktop.refresh()
  expect(fixture.menu.find((item) => item.label === 'Mock API · stopped').submenu.find((item: any) => item.label === 'Stop server').enabled).toBe(false)
  menu.submenu.find((item: any) => item.label === 'Open Mock API').click()
  expect(create).toHaveBeenCalledWith('/tool/network.mock-api')
  desktop.dispose()
})
