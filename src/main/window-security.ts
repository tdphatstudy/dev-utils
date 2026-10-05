import type { BrowserWindow } from 'electron'
import { clearAccessForOwner } from './secret-box/session'

export function isExternalUrlAllowed(value: string): boolean {
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
  } catch { return false }
}

export function isAppNavigation(value: string, expected: string): boolean {
  try {
    const actual = new URL(value), allowed = new URL(expected)
    actual.hash = ''; allowed.hash = ''
    return actual.href === allowed.href
  } catch { return false }
}

export function configureWindowSecurity(win: BrowserWindow, expected: string, openExternal: (url: string) => Promise<void>): void {
  const contents = win.webContents
  const ownerId = contents.id
  const lock = (): void => clearAccessForOwner(ownerId)
  win.once('closed', lock)
  contents.once('destroyed', lock)
  contents.on('render-process-gone', lock)
  contents.on('will-navigate', (event, url) => { if (!isAppNavigation(url, expected)) event.preventDefault() })
  contents.on('will-redirect', (event, url) => { if (!isAppNavigation(url, expected)) event.preventDefault() })
  contents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrlAllowed(url)) void openExternal(url).catch(() => { console.warn('[DevFusion] Could not open external link.') })
    return { action: 'deny' }
  })
}
