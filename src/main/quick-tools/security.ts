import type { BrowserWindow } from 'electron'
import { isAbsolute, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export function configureQuickWindowSecurity(win: BrowserWindow, dev: string | false | undefined): void {
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  win.webContents.session.setPermissionCheckHandler(() => false)
  win.webContents.session.setDevicePermissionHandler(() => false)
  const allowed = dev ? new URL(dev).origin : null
  const rendererRoot = join(__dirname, '../renderer')
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    let cancel = true
    try {
      const url = new URL(details.url)
      if (url.protocol === 'file:' && !dev) {
        const path = relative(rendererRoot, fileURLToPath(url))
        cancel = isAbsolute(path) || path === '..' || path.startsWith('..' + sep)
      } else if (['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) {
        const origin = url.origin.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:')
        cancel = !allowed || origin !== allowed
      } else cancel = url.protocol !== 'data:' && url.protocol !== 'blob:'
    } catch { /* Unknown/malformed requests fail closed. */ }
    callback({ cancel })
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', event => event.preventDefault())
  win.webContents.on('will-redirect', event => event.preventDefault())
  win.webContents.on('will-attach-webview', event => event.preventDefault())
}
