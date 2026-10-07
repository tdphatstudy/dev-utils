import { LocalDomainsService } from './local-domains/service'
import { MkcertCertificates } from './local-domains/certificates'
import { SystemHosts } from './platform/local-domains/hosts'
import { registerLocalDomainsIpc, clearLocalResolverCache } from './local-domains/ipc'
import { app, BrowserWindow, ipcMain, shell, dialog, Menu, protocol, powerMonitor } from 'electron'
import { VaultAutoLock, registerVaultSecurityIpc } from './vault-auto-lock'
import { join } from 'path'
import { stat } from 'fs/promises'
import { validateFilePath } from './file-hash'
import { registerFileHashIpc } from './file-hash-ipc'
import { assertTrustedIpc } from './ipc-trust'
import { lookupDns } from './dns-lookup'
import { is } from './env'
import { registerHttpIpc } from './http-ipc'
import { SecurityTestingService } from './security-testing/service'
import { registerSecurityTestingIpc } from './security-testing/ipc'
import { registerSecretBoxIpc, ensureDefaultSecretBox } from './secret-box'
import { registerPortsIpc } from './ports-ipc'
import { registerCryptoAndSshIpc } from './ssh/ipc'
import { pathToFileURL } from 'url'
import { configureWindowSecurity, configureAppPermissions } from './window-security'
import { APP_NAME } from '@shared/brand'
import { configureBrand, resourcePath } from './branding'
import { DesktopTray } from './tray'
import { LanguagePreferences, registerLanguageIpc } from './language'
import { translate } from '@shared/i18n/catalog'
import { attachWindowRecovery } from './window-recovery'
import { ScreenColorPicker, registerColorPickerIpc } from './color-picker'
import { clearAccess, clearAccessForOwner, getAccess, observeAccess } from './secret-box/session'
import { DesktopOcr, registerOcrIpc } from './ocr'
import { MockApiServer } from './mock-api-server'
import { registerMockApiIpc } from './mock-api-ipc'

protocol.registerSchemesAsPrivileged([{ scheme: 'devfusion-ocr', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }])

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
  // Avoid a spare renderer; retain Chromium's normal site isolation policy.
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion,SpareRendererForSitePerProcess')
}

applyMemorySwitches()
configureBrand()
let desktopTray: DesktopTray | undefined
let vaultPolicy: VaultAutoLock | undefined
const securityTesting = new SecurityTestingService()
const mainOwners = new Set<number>()
const language = new LanguagePreferences(app.getPath('userData'), () => [app.getLocale()], state => {
  desktopTray?.refresh()
  for (const win of BrowserWindow.getAllWindows()) {
    try { if (!win.isDestroyed() && mainOwners.has(win.webContents.id)) win.webContents.send('app:languageChanged', state) } catch { /* Closing window. */ }
  }
})
let stopObservingAccess: (() => void) | undefined
let quitting = false
let domainsCleanedForQuit = false
let domainsCleanupPending = false
const colorPicker: ScreenColorPicker = new ScreenColorPicker((selected) => { desktopTray?.refresh(); if (selected) desktopTray?.notifyColor(selected) }, (): boolean => !desktopOcr.isBusy())
const desktopOcr: DesktopOcr = new DesktopOcr(() => desktopTray?.refresh(), (): boolean => !colorPicker.isBusy())
const mockApi = new MockApiServer(() => desktopTray?.refresh())
const localDomainsDirectory = join(app.getPath('userData'), 'local-domains')
const localDomains = new LocalDomainsService(localDomainsDirectory, new SystemHosts(), new MkcertCertificates(localDomainsDirectory), clearLocalResolverCache)

function resolveAppIcon(): string | undefined {
  return resourcePath(process.platform === 'win32' ? 'icon.ico' : 'icon.png')
}

function createWindow(route = '/'): BrowserWindow {
  const icon = resolveAppIcon()
  const mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 720,
    minHeight: 500,
    show: false,
    title: APP_NAME,
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
  const owner = mainWindow.webContents.id
  mainOwners.add(owner)
  mainWindow.webContents.once('destroyed', () => { mainOwners.delete(owner); vaultPolicy?.forgetOwner(owner) })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })
  // Honor renderer beforeunload guards while allowing a deliberate close/discard.
  mainWindow.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning', title: APP_NAME, message: 'This view has unsaved changes or a save in progress.',
      detail: `Keep editing to save your work, and wait for any active save to finish. Unsaved edits will be discarded if you close. ${quitting ? 'DevFusion will stop.' : desktopTray?.hasTray() ? 'The window releases its memory; DevFusion stays in the tray.' : 'The window will close.'}`,
      buttons: ['Keep editing', 'Close without saving'], defaultId: 0, cancelId: 0, noLink: true
    })
    if (choice === 1) event.preventDefault()
    else { quitting = false; domainsCleanedForQuit = false; localDomains.cancelQuit() }
  })

  const rendererUrl = is.dev && process.env['ELECTRON_RENDERER_URL'] ? process.env['ELECTRON_RENDERER_URL'] : pathToFileURL(join(__dirname, '../renderer/index.html')).href
  configureAppPermissions(mainWindow.webContents.session, rendererUrl)
  configureWindowSecurity(mainWindow, rendererUrl, (url) => shell.openExternal(url))
  const recover = attachWindowRecovery(mainWindow, () => { clearAccessForOwner(owner); vaultPolicy?.forgetOwner(owner) }, async () => {
    const t = (message: string): string => translate(language.state().resolved, message)
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'warning', title: APP_NAME, message: t('The workspace stopped responding.'),
      detail: t('Reload to continue. Unsaved input may be lost. Your encrypted files remain on disk; unlock the box again after reloading.'),
      buttons: [t('Reload workspace'), t('Close')], defaultId: 0, cancelId: 1, noLink: true
    })
    return result.response === 0
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#${route}`).catch(error => { if (error?.code !== 'ERR_ABORTED') recover() })
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: route }).catch(error => { if (error?.code !== 'ERR_ABORTED') recover() })
  }
  return mainWindow
}

function registerIpc(): void {
  registerLanguageIpc(ipcMain, language)
  ipcMain.handle('window:minimize', (event) => {
    assertTrustedIpc(event)
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.handle('window:maximize', (event) => {
    assertTrustedIpc(event)
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })

  ipcMain.handle('window:close', (event) => {
    assertTrustedIpc(event)
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMain.handle('window:isMaximized', (event) => {
    assertTrustedIpc(event)
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
  registerSecurityTestingIpc(securityTesting)

  registerSecretBoxIpc()
  if (vaultPolicy) registerVaultSecurityIpc(ipcMain, vaultPolicy)
  registerPortsIpc()
  registerCryptoAndSshIpc()
  registerColorPickerIpc(colorPicker)
  registerOcrIpc(desktopOcr)
  registerMockApiIpc(mockApi)
  registerLocalDomainsIpc(localDomains)

  ipcMain.handle('app:platform', (event) => { assertTrustedIpc(event); return process.platform })
  ipcMain.handle('app:version', (event) => { assertTrustedIpc(event); return app.getVersion() })
  ipcMain.handle('app:trayAvailable', (event) => { assertTrustedIpc(event); return desktopTray?.hasTray() ?? false })
  ipcMain.handle('app:quit', (event) => { assertTrustedIpc(event); app.quit() })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('before-quit', (event) => {
    quitting = true
    if (domainsCleanedForQuit) return
    event.preventDefault()
    if (domainsCleanupPending) return
    domainsCleanupPending = true
    localDomains.beginQuit()
    void localDomains.cleanup().then(() => {
      domainsCleanupPending = false
      domainsCleanedForQuit = true
      app.quit()
    }).catch(async () => {
      quitting = false
      localDomains.cancelQuit()
      const choice = await dialog.showMessageBox({
        type: 'warning', title: APP_NAME,
        message: 'Local domain overrides could not be removed.',
        detail: 'Keep DevFusion open to retry Remove local overrides. If you quit now, marked hosts entries may still send those domains to localhost until you remove them.',
        buttons: ['Keep DevFusion open', 'Quit with overrides remaining'], defaultId: 0, cancelId: 0, noLink: true
      })
      domainsCleanupPending = false
      if (choice.response === 1) { domainsCleanedForQuit = true; app.quit() }
    }).catch(() => { domainsCleanupPending = false; quitting = false; localDomains.cancelQuit() })
  })
  app.on('second-instance', () => {
    desktopTray?.open()
  })

  app.whenReady().then(async () => {
    await language.start()
    vaultPolicy = new VaultAutoLock(powerMonitor, (owner) => BrowserWindow.getAllWindows().find((win) => win.webContents.id === owner) ?? null, app.getPath('userData'), () => mainOwners.values().next().value)
    await vaultPolicy.start()
    registerIpc()
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : [{ label: APP_NAME, submenu: [{ label: 'Quit DevFusion', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }] }]),
      { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }
    ]))
    desktopTray = new DesktopTray(createWindow, colorPicker, () => app.quit(), desktopOcr, mockApi, {
      language: () => language.state(), setLanguage: setting => language.set(setting),
      vaultUnlocked: () => !!getAccess(), lockVault: () => vaultPolicy?.lock('manual')
    })
    stopObservingAccess = observeAccess(() => desktopTray?.refresh())
    desktopTray.start()
    // Window first — do not block cold start on vault disk I/O
    desktopTray.open()
    void ensureDefaultSecretBox().catch((e) => {
      console.error('[DevFusion] ensureDefaultSecretBox failed', e)
    })

    app.on('activate', () => {
      desktopTray?.open()
    })
  }).catch(() => {
    try { dialog.showErrorBox(APP_NAME, 'DevFusion could not start. Restart the app to retry.') } finally { app.exit(1) }
  })

  app.on('window-all-closed', () => {
    if (!desktopTray?.hasTray() && process.platform !== 'darwin') app.quit()
  })
  app.on('will-quit', () => { stopObservingAccess?.(); securityTesting.dispose(); vaultPolicy?.dispose(); mockApi.dispose(); localDomains.dispose(); desktopTray?.dispose(); clearAccess() })
}
