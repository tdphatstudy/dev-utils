import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join, basename, sep } from 'node:path'
import { spawn } from 'node:child_process'

// Hidden native window, production renderer/preload, temporary fixture vaults/profile.
const root = await mkdtemp(join(tmpdir(), 'devutils-electron-security-'))
try {
  const entry = join(root, 'smoke.cjs')
  const source = `
    import { app, BrowserWindow, ipcMain } from 'electron'
    import { mkdir, writeFile, readFile } from 'fs/promises'
    import { join } from 'path'
    import { pathToFileURL } from 'url'
    import { randomBytes } from 'crypto'
    import { configureWindowSecurity } from './src/main/window-security'
    import { registerSecretBoxIpc } from './src/main/secret-box/ipc'
    import { setAccess, bindSessionOwner, getSessionId, getAccess } from './src/main/secret-box/session'
    import { sealDoc, serializeEnvelope } from './src/main/secret-box/crypto'
    import { SCRYPT_PARAMS } from './src/shared/secret-box/constants'
    const root = ${JSON.stringify(root)}
    const renderer = ${JSON.stringify(resolve('out/renderer/index.html'))}
    const preload = ${JSON.stringify(resolve('out/preload/index.js'))}
    app.setPath('userData', root); app.setPath('sessionData', root); app.setPath('crashDumps', root)
    const expected = pathToFileURL(renderer).href
    process.env.ELECTRON_RENDERER_URL = expected
    let win
    const assert = (ok, message) => { if (!ok) throw new Error(message) }
    app.whenReady().then(async () => {
      try {
        const first = join(root, 'A'), second = join(root, 'B')
        await mkdir(first); await mkdir(second)
        const config = { version: 1, mode: 'portable', kdf: 'scrypt', kdfParams: SCRYPT_PARAMS, salt: randomBytes(16).toString('base64'), createdAt: new Date().toISOString() }
        const access = path => ({ rootPath: path, mode: 'portable', config, keyA: randomBytes(32), keyB: randomBytes(32) })
        const a = access(first), b = access(second)
        const payload = { name: 'fixture.txt', type: 'text', encoding: 'utf-8', createdAt: config.createdAt, updatedAt: config.createdAt, content: 'fixture A' }
        await writeFile(join(first,'same.putl'), serializeEnvelope(sealDoc(a.keyA,a.keyB,'portable',payload)))
        await writeFile(join(second,'same.putl'), serializeEnvelope(sealDoc(b.keyA,b.keyB,'portable',{...payload,content:'fixture B'})))
        registerSecretBoxIpc()
        ipcMain.handle('app:platform', () => process.platform); ipcMain.handle('app:version', () => app.getVersion())
        ipcMain.handle('window:isMaximized', () => false)
        win = new BrowserWindow({ show: false, webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } })
        let opened = 0
        configureWindowSecurity(win, expected, async () => { opened++ })
        await win.loadURL(expected + '#/tool/yaml.studio')
        await win.webContents.executeJavaScript("new Promise((resolve,reject) => { const start=Date.now(); const timer=setInterval(() => { if(document.body.textContent.includes('Valid YAML')){clearInterval(timer);resolve(true)}else if(Date.now()-start>10000){clearInterval(timer);reject(new Error('YAML worker not ready: '+document.body.textContent.slice(-300)))} },50) })")
        console.log('PASS Electron '+process.versions.electron+' production file-URL YAML worker and preload')
        setAccess(a); bindSessionOwner(win.webContents.id)
        const tokenA = getSessionId()
        const doc = await win.webContents.executeJavaScript("window.devutils.privateBox.readFile('same.putl'," + JSON.stringify(tokenA) + ")")
        assert(doc.content === 'fixture A', 'Fixture A read failed')
        setAccess(b); bindSessionOwner(win.webContents.id)
        const original = await readFile(join(second,'same.putl'))
        let rejected = false
        try { await win.webContents.executeJavaScript("window.devutils.privateBox.writeFile('same.putl','stale fixture A'," + JSON.stringify(tokenA) + ")") }
        catch(error) { rejected = error.message.includes('SESSION_CHANGED') }
        assert(rejected && original.equals(await readFile(join(second,'same.putl'))), 'Stale IPC changed box B')
        console.log('PASS native preload/IPC refuses stale session without changing box B')
        await win.webContents.executeJavaScript("window.open('ms-settings:privacy'); window.location.href='https://example.com/'")
        await new Promise(resolve => setTimeout(resolve, 200))
        assert(opened === 0 && win.webContents.getURL().startsWith(expected), 'Native navigation policy failed')
        console.log('PASS external navigation and OS protocol popup blocked')
        win.destroy()
        assert(getAccess() === null && b.keyA.every(byte => byte === 0) && b.keyB.every(byte => byte === 0), 'Native close retained keys')
        console.log('PASS native window destruction clears and zeroes keys')
        app.exit(0)
      } catch(error) { console.error('SMOKE FAILED', error.message); win?.destroy(); app.exit(1) }
    })
  `
  await build({ stdin: { contents: source, resolveDir: process.cwd(), loader: 'ts' }, outfile: entry, bundle: true, platform: 'node', format: 'cjs', packages: 'external', alias: { '@shared': resolve('src/shared') } })
  const electron = createRequire(import.meta.url)('electron')
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(electron, [entry], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.pipe(process.stdout); child.stderr.pipe(process.stderr)
  let timer
  const code = await new Promise((done, reject) => {
    timer = setTimeout(() => { child.kill(); reject(new Error('Native smoke exceeded 45 seconds')) }, 45000)
    child.once('error', reject); child.once('exit', done)
  }).finally(() => clearTimeout(timer))
  if (code !== 0) throw new Error('Native smoke exited ' + code)
} finally {
  const target = resolve(root)
  if (!target.startsWith(resolve(tmpdir()) + sep) || !basename(target).startsWith('devutils-electron-security-')) throw new Error('Unexpected cleanup path')
  await rm(target, { recursive: true, force: true })
}
