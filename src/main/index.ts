import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { createHash } from 'crypto'
import { readFile, stat } from 'fs/promises'
import { promises as dns } from 'dns'
import { is } from './env'

function resolveAppIcon(): string {
  const candidates = [
    join(process.resourcesPath, 'icon.png'),
    join(app.getAppPath(), 'resources', 'icon.png'),
    join(__dirname, '../../resources/icon.png'),
    join(__dirname, '../../resources/icon.ico')
  ]
  return candidates.find((p) => existsSync(p)) ?? candidates[2]!
}

function createWindow(): void {
  const icon = resolveAppIcon()
  const mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'DevUtils',
    icon,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 14 },
    ...(process.platform !== 'darwin'
      ? {
          frame: false,
          titleBarOverlay: false
        }
      : {}),
    backgroundColor: '#1C1C1E',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.handle('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })

  ipcMain.handle('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMain.handle('window:isMaximized', (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
  })

  ipcMain.handle(
    'file:hash',
    async (
      _event,
      payload: { path: string; algorithm: 'md5' | 'sha1' | 'sha256' | 'sha512' }
    ) => {
      const data = await readFile(payload.path)
      const hash = createHash(payload.algorithm).update(data).digest('hex')
      return hash
    }
  )

  ipcMain.handle('file:info', async (_event, filePath: string) => {
    const s = await stat(filePath)
    return {
      path: filePath,
      size: s.size,
      isFile: s.isFile(),
      mtimeMs: s.mtimeMs,
      ctimeMs: s.ctimeMs
    }
  })

  ipcMain.handle('dialog:openFile', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: [{ name: 'All Files', extensions: ['*'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(
    'net:dnsLookup',
    async (
      _event,
      payload: { hostname: string; recordType: 'A' | 'AAAA' | 'MX' | 'TXT' | 'CNAME' | 'NS' }
    ) => {
      const host = payload.hostname.trim()
      if (!host || /[\s/]/.test(host)) {
        throw new Error('Invalid hostname')
      }
      const cleaned = host.replace(/^https?:\/\//i, '').split('/')[0]!.split(':')[0]!

      switch (payload.recordType) {
        case 'A': {
          const r = await dns.resolve4(cleaned)
          return { hostname: cleaned, type: 'A', records: r }
        }
        case 'AAAA': {
          const r = await dns.resolve6(cleaned)
          return { hostname: cleaned, type: 'AAAA', records: r }
        }
        case 'MX': {
          const r = await dns.resolveMx(cleaned)
          return { hostname: cleaned, type: 'MX', records: r }
        }
        case 'TXT': {
          const r = await dns.resolveTxt(cleaned)
          return { hostname: cleaned, type: 'TXT', records: r.map((x) => x.join('')) }
        }
        case 'CNAME': {
          const r = await dns.resolveCname(cleaned)
          return { hostname: cleaned, type: 'CNAME', records: r }
        }
        case 'NS': {
          const r = await dns.resolveNs(cleaned)
          return { hostname: cleaned, type: 'NS', records: r }
        }
        default:
          throw new Error('Unsupported record type')
      }
    }
  )

  ipcMain.handle('app:platform', () => process.platform)
  ipcMain.handle('app:version', () => app.getVersion())
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    registerIpc()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
