import { EventEmitter } from 'events'
import type { BrowserWindow, Session } from 'electron'
import { afterEach, expect, it, vi } from 'vitest'
import { configureWindowSecurity, configureAppPermissions, isAppNavigation, isExternalUrlAllowed } from './window-security'
import { bindSessionOwner, clearAccess, getAccess, setAccess } from './secret-box/session'
import { SCRYPT_PARAMS } from '@shared/secret-box/constants'

afterEach(clearAccess)
it('allows only HTTP(S) external links without credentials and exact app navigation', () => {
  for (const url of ['file:///C:/secret.txt', 'javascript:alert(1)', 'ms-settings:privacy', 'https://user:secret@example.com', 'not a url']) expect(isExternalUrlAllowed(url)).toBe(false)
  expect(isExternalUrlAllowed('https://example.com/docs')).toBe(true)
  expect(isAppNavigation('file:///app/index.html#/tool/json.studio', 'file:///app/index.html')).toBe(true)
  expect(isAppNavigation('file:///app/other.html', 'file:///app/index.html')).toBe(false)
})
it.each(['closed', 'destroyed', 'render-process-gone'])('zeroes owned keys when the window fires %s', (event) => {
  const win = new EventEmitter(), contents = Object.assign(new EventEmitter(), { id: 1, setWindowOpenHandler: vi.fn() })
  Object.assign(win, { webContents: contents })
  configureWindowSecurity(win as BrowserWindow, 'file:///app/index.html', vi.fn())
  const keyA = Buffer.alloc(32, 1), keyB = Buffer.alloc(32, 2)
  setAccess({ rootPath: 'fixture', mode: 'portable', keyA, keyB, config: { version: 1, mode: 'portable', kdf: 'scrypt', kdfParams: SCRYPT_PARAMS, salt: '', createdAt: '' } })
  bindSessionOwner(1)
  ;(event === 'closed' ? win : contents).emit(event)
  expect(getAccess()).toBeNull(); expect(keyA.every(byte => byte === 0) && keyB.every(byte => byte === 0)).toBe(true)
})
it('blocks external navigation and OS protocol popups without launching anything', () => {
  const win = new EventEmitter(), handler = vi.fn(), open = vi.fn().mockResolvedValue(undefined)
  const contents = Object.assign(new EventEmitter(), { id: 1, setWindowOpenHandler: handler })
  Object.assign(win, { webContents: contents })
  configureWindowSecurity(win as BrowserWindow, 'file:///app/index.html', open)
  const event = { preventDefault: vi.fn() }
  contents.emit('will-navigate', event, 'https://example.com')
  expect(event.preventDefault).toHaveBeenCalled()
  expect(handler.mock.calls[0][0]({ url: 'ms-settings:privacy' })).toEqual({ action: 'deny' })
  expect(open).not.toHaveBeenCalled()
  const webview = { preventDefault: vi.fn() }
  contents.emit('will-attach-webview', webview)
  expect(webview.preventDefault).toHaveBeenCalledOnce()
})

it('denies browser/device permissions and permits only app main-frame clipboard writes', () => {
  const request = vi.fn(), check = vi.fn(), device = vi.fn()
  configureAppPermissions({ setPermissionRequestHandler: request, setPermissionCheckHandler: check, setDevicePermissionHandler: device } as unknown as Session, 'file:///app/index.html')
  const contents = { isDestroyed: () => false, getURL: () => 'file:///app/index.html#/tool/security.env' }
  const details = { isMainFrame: true, requestingUrl: 'file:///app/index.html#/tool/security.env' }
  const handler = check.mock.calls[0][0]
  expect(handler(contents, 'clipboard-sanitized-write', 'file://', details)).toBe(true)
  for (const permission of ['clipboard-read', 'media', 'display-capture', 'geolocation', 'notifications', 'usb', 'serial', 'fileSystem', 'unknown']) {
    expect(handler(contents, permission, 'file://', details)).toBe(false)
    const callback = vi.fn()
    request.mock.calls[0][0](contents, permission, callback, details)
    expect(callback).toHaveBeenCalledWith(false)
  }
  for (const invalid of [{ ...details, isMainFrame: false }, { ...details, requestingUrl: 'file:///app/other.html' }, { isMainFrame: true }]) {
    expect(handler(contents, 'clipboard-sanitized-write', 'file://', invalid)).toBe(false)
  }
  expect(handler(null, 'clipboard-sanitized-write', 'file://', details)).toBe(false)
  expect(handler({ ...contents, isDestroyed: () => true }, 'clipboard-sanitized-write', 'file://', details)).toBe(false)
  expect(handler({ ...contents, getURL: () => 'https://example.com' }, 'clipboard-sanitized-write', 'file://', details)).toBe(false)
  expect(device.mock.calls[0][0]({ deviceType: 'usb' })).toBe(false)
})
