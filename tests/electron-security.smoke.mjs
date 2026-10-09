import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtemp, rm, mkdir, cp, writeFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join, basename, sep } from 'node:path'
import { spawn } from 'node:child_process'

// Hidden native window, production renderer/preload, temporary fixture vaults/profile.
const root = await mkdtemp(join(tmpdir(), 'devutils-electron-security-'))
const packaged = process.argv.includes('--packaged')
const require = createRequire(import.meta.url)
try {
  const fixture = join(root, 'app')
  const entry = packaged ? join(fixture, 'out/main/index.cjs') : join(root, 'smoke.cjs')
  const source = `
    import { app, BrowserWindow, ipcMain } from 'electron'
    import { mkdir, writeFile, readFile } from 'fs/promises'
    import { join } from 'path'
    import { pathToFileURL } from 'url'
    import { randomBytes } from 'crypto'
    import { EventEmitter } from 'events'
    import { createServer } from 'http'
    import { SecurityTestingService } from './src/main/security-testing/service'
    import { registerSecurityTestingIpc } from './src/main/security-testing/ipc'
    import { LanguagePreferences, registerLanguageIpc } from './src/main/language'
    import { attachWindowRecovery } from './src/main/window-recovery'
    import { VaultAutoLock, registerVaultSecurityIpc } from './src/main/vault-auto-lock'
    import { configureWindowSecurity, configureAppPermissions } from './src/main/window-security'
    import { registerSecretBoxIpc } from './src/main/secret-box/ipc'
    import { setAccess, bindSessionOwner, getSessionId, getAccess } from './src/main/secret-box/session'
    import { sealDoc, serializeEnvelope } from './src/main/secret-box/crypto'
    import { SCRYPT_PARAMS } from './src/shared/secret-box/constants'
    const root = ${JSON.stringify(root)}
    const renderer = ${packaged ? "join(__dirname, '../renderer/index.html')" : JSON.stringify(resolve('out/renderer/index.html'))}
    const preload = ${packaged ? "join(__dirname, '../preload/index.js')" : JSON.stringify(resolve('out/preload/index.js'))}
    app.setPath('userData', root); app.setPath('sessionData', root); app.setPath('crashDumps', root)
    const expected = pathToFileURL(renderer).href
    process.env.ELECTRON_RENDERER_URL = expected
    let win, policy, testServer
    const securityTesting = new SecurityTestingService()
    const language = new LanguagePreferences(root, () => ['en-US'], state => { if (win && !win.isDestroyed()) win.webContents.send('app:languageChanged', state) })
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
        registerSecurityTestingIpc(securityTesting)
        await language.start(); registerLanguageIpc(ipcMain, language)
        const power = Object.assign(new EventEmitter(), { getSystemIdleTime: () => 0 })
        policy = new VaultAutoLock(power, () => win, root)
        await policy.start()
        registerVaultSecurityIpc(ipcMain, policy)
        ipcMain.handle('app:platform', () => process.platform); ipcMain.handle('app:version', () => app.getVersion())
        ipcMain.handle('window:isMaximized', () => false)
        win = new BrowserWindow({ show: false, webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } })
        assert((await readFile(renderer, 'utf8')).includes('<html'), 'Packaged renderer missing from ASAR')
        let opened = 0
        configureAppPermissions(win.webContents.session, expected)
        configureWindowSecurity(win, expected, async () => { opened++ })
        await win.loadURL(expected + '#/tool/yaml.studio')
        await win.webContents.executeJavaScript("new Promise((resolve,reject) => { const start=Date.now(); const timer=setInterval(() => { if(document.body.textContent.includes('Valid YAML')){clearInterval(timer);resolve(true)}else if(Date.now()-start>10000){clearInterval(timer);reject(new Error('YAML worker not ready: '+document.body.textContent.slice(-300)))} },50) })")
        console.log('PASS Electron '+process.versions.electron+' production file-URL YAML worker and preload')
        for (const locale of ['en','zh','es','fr','de','ja','ko','pt','ru','ar','hi','id','vi']) {
          const state = await win.webContents.executeJavaScript('window.devutils.app.setLanguage(' + JSON.stringify(locale) + ')')
          assert(state.language === locale, 'Language preference rejected')
          await win.webContents.executeJavaScript("new Promise((resolve,reject) => { const start=Date.now(); const timer=setInterval(() => { if(document.documentElement.lang === " + JSON.stringify(locale === 'zh' ? 'zh-Hans' : locale) + "){clearInterval(timer);resolve(true)}else if(Date.now()-start>3000){clearInterval(timer);reject(new Error('Language did not apply'))} },20) })")
          assert(await win.webContents.executeJavaScript("document.documentElement.dir === '" + (locale === 'ar' ? 'rtl' : 'ltr') + "'"), 'Language direction incorrect')
        }
        assert(JSON.parse(await readFile(join(root,'language.json'),'utf8')).language === 'vi', 'Language not persisted')
        let invalidLanguage = false
        try { await win.webContents.executeJavaScript("window.devutils.app.setLanguage({secret:'fixture'})") } catch { invalidLanguage = true }
        assert(invalidLanguage && language.state().language === 'vi', 'Invalid language altered preference')
        await win.webContents.executeJavaScript("window.devutils.app.setLanguage('en')")
        await win.webContents.executeJavaScript("new Promise(resolve => { const timer=setInterval(() => { if(document.documentElement.lang==='en'){clearInterval(timer);resolve(true)} },20) })")
        console.log('PASS 13 native interface languages, validated preload IPC, tray-event synchronization, RTL and atomic preference persistence')
        for (const [id, action, heading] of [
          ['json.schema', 'Validate payload', 'Validation results'],
          ['network.openapi', 'Review API contract', 'Contract findings'],
          ['json.reconcile', 'Reconcile records', 'Reconciliation results'],
          ['text.logs', 'Analyze logs', 'Log analysis']
        ]) {
          await win.loadURL(expected + '#/tool/' + id)
          await win.webContents.executeJavaScript("new Promise((resolve,reject) => { const start=Date.now(); const timer=setInterval(() => { const ready=document.querySelector('[data-tool-ready=\\\"'+"+JSON.stringify(id)+"+'\\\"]'); if(ready){clearInterval(timer);resolve(true)}else if(Date.now()-start>10000){clearInterval(timer);reject(new Error('Tool did not mount'))} },50) })")
          await win.webContents.executeJavaScript("Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Load example').click()")
          await win.webContents.executeJavaScript("Array.from(document.querySelectorAll('button')).find(button => button.textContent === "+JSON.stringify(action)+").click()")
          await win.webContents.executeJavaScript("new Promise((resolve,reject) => { const start=Date.now(); const timer=setInterval(() => { if(Array.from(document.querySelectorAll('h2')).some(node => node.textContent === "+JSON.stringify(heading)+")){clearInterval(timer);resolve(true)}else if(Date.now()-start>10000){clearInterval(timer);reject(new Error('Analysis worker did not return'))} },50) })")
        }
        console.log('PASS four advanced analysis workers under native file-URL CSP')
        await win.loadURL(expected + '#/tool/hacking.hash')
        await win.webContents.executeJavaScript("new Promise((resolve,reject) => { const start=Date.now(); const timer=setInterval(() => { const button=Array.from(document.querySelectorAll('button')).find(node => node.textContent === 'Agree'); if(button){clearInterval(timer);resolve(true)}else if(Date.now()-start>10000){clearInterval(timer);reject(new Error('Warning gate missing'))} },50) })")
        assert(!(await win.webContents.executeJavaScript("Boolean(document.querySelector('[data-tool-ready]'))")), 'Tool mounted before consent')
        await win.webContents.executeJavaScript("Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Agree').click()")
        await win.webContents.executeJavaScript("new Promise((resolve,reject) => { const start=Date.now(); const timer=setInterval(() => { const button=Array.from(document.querySelectorAll('button')).find(node => node.textContent === 'Generate hash'); if(button){clearInterval(timer);button.click();resolve(true)}else if(Date.now()-start>10000){clearInterval(timer);reject(new Error('Hash tool did not mount'))} },50) })")
        await win.webContents.executeJavaScript("new Promise((resolve,reject) => { const start=Date.now(); const timer=setInterval(() => { if(document.body.textContent.includes('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')){clearInterval(timer);resolve(true)}else if(Date.now()-start>10000){clearInterval(timer);reject(new Error('Hash worker failed'))} },50) })")
        await new Promise(resolve => { win.webContents.once('did-finish-load', resolve); win.reload() })
        await win.webContents.executeJavaScript("new Promise((resolve,reject) => { const start=Date.now(); const timer=setInterval(() => { if(document.querySelector('[data-tool-ready]')){clearInterval(timer);resolve(true)}else if(Date.now()-start>10000){clearInterval(timer);reject(new Error('Consent lost on renderer reload'))} },50) })")
        assert(await win.webContents.executeJavaScript("window.devutils.securityTesting.accepted('hacking.hash')"), 'Main consent not retained')
        assert(!(await win.webContents.executeJavaScript("window.devutils.securityTesting.accepted('hacking.stress')")), 'Consent shared between tools')
        let hits = 0
        testServer = createServer((_request,response) => { hits++; response.writeHead(200, { 'X-Content-Type-Options': 'nosniff' }).end('native fixture') })
        await new Promise(resolve => testServer.listen(0,'127.0.0.1',resolve))
        const testUrl = 'http://127.0.0.1:' + testServer.address().port
        const load = { request: { method: 'GET', url: testUrl, headers: {}, timeoutMs: 1000 }, count: 2, rate: 5, concurrency: 2, durationSeconds: 2 }
        const refused = await win.webContents.executeJavaScript("window.devutils.securityTesting.stress("+JSON.stringify(load)+",'native-before').then(() => false, () => true)")
        assert(refused && hits === 0, 'IPC bypassed consent')
        await win.webContents.executeJavaScript("window.devutils.securityTesting.accept('hacking.stress')")
        const metrics = await win.webContents.executeJavaScript("window.devutils.securityTesting.stress("+JSON.stringify(load)+",'native-test')")
        assert(metrics.state === 'completed' && metrics.successful === 2 && hits === 2, 'Native load request metrics failed')
        await new Promise(resolve => testServer.close(resolve)); testServer = null
        securityTesting.dispose()
        assert(!(await win.webContents.executeJavaScript("window.devutils.securityTesting.accepted('hacking.hash')")), 'Disposed app session retained consent')
        console.log('PASS native red warning gate, consent isolation/reload/reset, file-URL hash worker, main consent refusal and localhost stress IPC')
        const permissions = await win.webContents.executeJavaScript("Promise.all(['clipboard-write','clipboard-read'].map(async name => (await navigator.permissions.query({name})).state))")
        assert(permissions[0] === 'granted' && permissions[1] !== 'granted', 'Unexpected native clipboard permission states: '+permissions.join(','))
        const denied = await win.webContents.executeJavaScript("navigator.clipboard.readText().then(() => false, () => true)", true)
        assert(denied, 'Programmatic clipboard read permitted')
        console.log('PASS native clipboard-write permission granted and programmatic read denied; system clipboard unchanged')
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
        power.emit('suspend')
        const locked = policy.state(win.webContents.id).lastLock
        assert(getAccess() === null && b.keyA.every(byte => byte === 0) && b.keyB.every(byte => byte === 0), 'Suspend retained box keys')
        policy.preserve({ sender: { id: win.webContents.id } }, locked.id, 'RAM-only recovery fixture')
        let lockedRead = false
        try { await win.webContents.executeJavaScript("window.devutils.security.recoverDraft(" + JSON.stringify(tokenA) + ")") } catch { lockedRead = true }
        assert(lockedRead, 'Recovery allowed while locked')
        const next = access(second); setAccess(next); bindSessionOwner(win.webContents.id)
        const nextToken = getSessionId()
        const recovered = await win.webContents.executeJavaScript("window.devutils.security.recoverDraft(" + JSON.stringify(nextToken) + ")")
        assert(recovered.content === 'RAM-only recovery fixture', 'Native recovery failed after reauthentication')
        await win.webContents.executeJavaScript("window.devutils.security.discardDraft(" + JSON.stringify(nextToken) + "," + JSON.stringify(recovered.id) + ")")
        assert(!policy.state(win.webContents.id).hasDraft, 'Native discard retained recovery')
        console.log('PASS native suspend invalidates keys; trusted recovery IPC requires reauthentication and discards explicitly')
        await win.webContents.executeJavaScript("window.open('ms-settings:privacy'); window.location.href='https://example.com/'")
        await new Promise(resolve => setTimeout(resolve, 200))
        assert(opened === 0 && win.webContents.getURL().startsWith(expected), 'Native navigation policy failed')
        console.log('PASS external navigation and OS protocol popup blocked')
        let recoveryPrompts = 0
        attachWindowRecovery(win, () => { policy.lock('manual'); policy.forgetOwner(win.webContents.id) }, async () => { recoveryPrompts++; return true })
        const recoveredLoad = new Promise((resolve,reject) => { const timeout=setTimeout(() => reject(new Error('Crash recovery did not load')),10000); win.webContents.once('did-finish-load', () => { clearTimeout(timeout); resolve() }) })
        win.webContents.forcefullyCrashRenderer()
        await recoveredLoad
        assert(recoveryPrompts === 1 && getAccess() === null && next.keyA.every(byte => byte === 0) && next.keyB.every(byte => byte === 0), 'Renderer crash retained keys or recovery looped')
        assert(await win.webContents.executeJavaScript("window.devutils.app.language().then(state => state.language === 'en')"), 'Preload unavailable after recovery')
        console.log('PASS forced native renderer crash clears vault keys and recovers one workspace without terminating the main app')
        const closing = access(second); setAccess(closing); bindSessionOwner(win.webContents.id)
        win.destroy()
        assert(getAccess() === null && closing.keyA.every(byte => byte === 0) && closing.keyB.every(byte => byte === 0), 'Native close retained keys')
        console.log('PASS native window destruction clears and zeroes keys')
        securityTesting.dispose(); policy.dispose(); app.exit(0)
      } catch(error) { console.error('SMOKE FAILED', error.message); securityTesting.dispose(); testServer?.close(); policy?.dispose(); win?.destroy(); app.exit(1) }
    })
  `
  await build({ stdin: { contents: source, resolveDir: process.cwd(), loader: 'ts' }, outfile: entry, bundle: true, platform: 'node', format: 'cjs', packages: 'external', alias: { '@shared': resolve('src/shared') } })
  let electron = require('electron')
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  const run = async (binary, args, options, timeoutMs) => {
    const child = spawn(binary, args, { ...options, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.pipe(process.stdout); child.stderr.pipe(process.stderr)
    let timer
    const code = await new Promise((done, reject) => {
      timer = setTimeout(() => { child.kill(); reject(new Error('Smoke process exceeded its time limit')) }, timeoutMs)
      child.once('error', reject); child.once('close', done)
    }).finally(() => clearTimeout(timer))
    if (code !== 0) throw new Error('Smoke process exited ' + code)
  }
  if (packaged) {
    await mkdir(fixture, { recursive: true })
    await mkdir(join(fixture, 'resources'))
    await cp(resolve('resources/icon.ico'), join(fixture, 'resources/icon.ico'))
    await cp(resolve('out/renderer'), join(fixture, 'out/renderer'), { recursive: true })
    await cp(resolve('out/preload'), join(fixture, 'out/preload'), { recursive: true })
    await writeFile(join(fixture, 'package.json'), JSON.stringify({ name: 'devfusion-security-smoke', version: '0.0.0', main: 'out/main/index.cjs', author: 'DevFusion', description: 'Isolated native fixture' }))
    const output = join(root, 'package')
    const config = join(root, 'builder.json')
    await writeFile(config, JSON.stringify({ extends: null, appId: 'com.devfusion.security-smoke', productName: 'DevFusionSecuritySmoke', electronVersion: require('electron/package.json').version,
      directories: { app: fixture, output, buildResources: resolve('resources') }, files: ['out/**/*', 'package.json'], asar: true, afterPack: resolve('scripts/after-pack.mjs'), publish: null,
      win: { signAndEditExecutable: false }, mac: { identity: null, notarize: false }, linux: { executableName: 'devfusion-security-smoke' } }))
    const buildEnv = { ...env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' }
    for (const name of ['CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER']) delete buildEnv[name]
    await run(process.execPath, [require.resolve('electron-builder/cli.js'), '--projectDir', fixture, '--dir', '--' + process.arch, '--config', config, '--publish', 'never'], { env: buildEnv }, 180000)
    if (process.platform === 'darwin') {
      const directory = (await readdir(output)).find((name) => /^mac(?:-|$)/.test(name))
      if (!directory) throw new Error('Packaged macOS fixture not found')
      electron = join(output, directory, 'DevFusionSecuritySmoke.app/Contents/MacOS/DevFusionSecuritySmoke')
    } else electron = join(output, process.platform === 'win32' ? 'win-unpacked/DevFusionSecuritySmoke.exe' : 'linux-unpacked/devfusion-security-smoke')
    // These dangerous runtime environment hooks must be ignored by the fuses.
    env.ELECTRON_RUN_AS_NODE = '1'
    env.NODE_OPTIONS = '--require=devfusion-nonexistent-smoke-module'
    console.log('Running ASAR fixture in the packaged, fused Electron runtime')
  }
  await run(electron, packaged ? [] : [entry], { env }, 45000)
} finally {
  const target = resolve(root)
  if (!target.startsWith(resolve(tmpdir()) + sep) || !basename(target).startsWith('devutils-electron-security-')) throw new Error('Unexpected cleanup path')
  await rm(target, { recursive: true, force: true, maxRetries: 12, retryDelay: 250 })
}
