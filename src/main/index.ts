import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { stat } from 'fs/promises'
import { validateFilePath } from './file-hash'
import { registerFileHashIpc } from './file-hash-ipc'
import { assertTrustedIpc } from './ipc-trust'
import { lookupDns } from './dns-lookup'
import { is } from './env'
import { registerHttpIpc } from './http-ipc'
import { registerSecretBoxIpc, ensureDefaultSecretBox } from './secret-box'
import { registerPortsIpc } from './ports-ipc'
import { registerCryptoAndSshIpc } from './ssh/ipc'

/**
 * Chromium/V8 switches must run before app.ready.
 * Goal: trim idle footprint for a single-window local toolkit (not a browser).
 */
function applyMemorySwitches(): void {
  // Tiny disk/HTTP caches — toolkit rarely needs multi-MB Chromium caches
  app.commandLine.appendSwitch('disk-cache-size', String(8 * 1024 * 1024))
  app.commandLine.appendSwitch('media-cache-size', '1')
  // Prefer slightly smaller codegen when idle; tools still work normally
  app.commandLine.appendSwitch('js-flags', '--optimize-for-size')
  // Single-window app: no benefit from site isolation multi-process bloat
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion,SpareRendererForSitePerProcess')
}

applyMemorySwitches()

function resolveAppIcon(): string | undefined {
  // Packaged: extraResources → process.resourcesPath
  // Dev: project resources/ next to out/
  const candidates = [
    join(process.resourcesPath, 'icon.ico'),
    join(process.resourcesPath, 'icon.png'),
    join(app.getAppPath(), 'resources', 'icon.ico'),
    join(app.getAppPath(), 'resources', 'icon.png'),
    join(__dirname, '../../resources/icon.ico'),
    join(__dirname, '../../resources/icon.png')
  ]
  return candidates.find((p) => existsSync(p))
}

function createWindow(): void {
  const icon = resolveAppIcon()
  const mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 720,
    minHeight: 500,
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
      webSecurity: true,
      spellcheck: false,
      backgroundThrottling: true,
      // Code caching improves warm start; default can retain more bytecode
      v8CacheOptions: 'code',
      // No extra Blink features / no background network
      autoplayPolicy: 'user-gesture-required'
    }
  })

  mainWindow.once('ready-to-show', () => {
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

  registerFileHashIpc()

  ipcMain.handle('file:info', async (event, filePath: string) => {
    assertTrustedIpc(event)
    validateFilePath(filePath)
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
    assertTrustedIpc(event)
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: [{ name: 'All Files', extensions: ['*'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  const dnsInFlight = new Set<number>()
  ipcMain.handle(
    'net:dnsLookup',
    async (
      event,
      payload: unknown
    ) => {
      assertTrustedIpc(event)
      const ownerId = event.sender.id
      if (dnsInFlight.has(ownerId)) throw new Error('A DNS lookup is already running. Wait for completion.')
      dnsInFlight.add(ownerId)
      try { return await lookupDns(payload) }
      finally { dnsInFlight.delete(ownerId) }
    }
  )

  registerHttpIpc()

  registerSecretBoxIpc()
  registerPortsIpc()
  registerCryptoAndSshIpc()

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
    // Window first — do not block cold start on vault disk I/O
    createWindow()
    void ensureDefaultSecretBox().catch((e) => {
      console.error('[DevUtils] ensureDefaultSecretBox failed', e)
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
