import { spawn } from 'node:child_process'
import { cp, mkdir, mkdtemp, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { requireProtectedBuild } from '../scripts/build-policy.mjs'
import { verifyPackageIntegrity } from '../scripts/package-integrity.mjs'
import { readCatalogRows } from '../scripts/i18n-coverage.mjs'

const require = createRequire(import.meta.url)
const root = await mkdtemp(join(tmpdir(), 'devfusion-protection-'))
const run = async (binary, args, timeout = 90000, extraEnv = {}) => {
  const env = { ...process.env, ...extraEnv, CSC_IDENTITY_AUTO_DISCOVERY: 'false' }
  for (const name of ['ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER']) delete env[name]
  const child = spawn(binary, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = '', stderr = '', timer
  child.stdout.on('data', value => { stdout = (stdout + value).slice(-32768) })
  child.stderr.on('data', value => { stderr = (stderr + value).slice(-32768) })
  const code = await new Promise((done, fail) => {
    child.once('error', fail); child.once('close', done)
    timer = setTimeout(() => { child.kill(); fail(new Error('Protected smoke timed out.\n' + stdout + '\n' + stderr)) }, timeout)
  }).finally(() => clearTimeout(timer))
  return { code, stdout, stderr }
}
const assert = (value, message) => { if (!value) throw new Error(message) }

try {
  await requireProtectedBuild(process.cwd(), process.platform, process.arch, require('electron/package.json').version)
  const fixture = join(root, 'app'), output = join(root, 'package')
  await mkdir(fixture)
  await mkdir(join(fixture, 'resources'))
  await cp(resolve('resources/icon.ico'), join(fixture, 'resources/icon.ico'))
  await cp(resolve('out'), join(fixture, 'out'), { recursive: true })
  await mkdir(join(fixture, 'node_modules'))
  await cp(dirname(require.resolve('yaml/package.json')), join(fixture, 'node_modules/yaml'), { recursive: true, dereference: true })
  await rename(join(fixture, 'out/main/index.cjs'), join(fixture, 'out/main/production.cjs'))
  const rows = await readCatalogRows()
  const closeCopy = ['This view has unsaved changes or a save in progress.', 'Keep editing', 'Close without saving'].map(key => {
    const row = rows.find(row => row.values[0] === key)
    assert(row, 'Missing native close-dialog translation: ' + key)
    return row.values[12]
  })
  const source = `
    const { app, BrowserWindow, clipboard, dialog, ipcMain } = require('electron')
    const fs = require('fs'), path = require('path')
    const profile = ${JSON.stringify(join(root, 'profile'))}
    fs.mkdirSync(profile, {recursive:true})
    app.setPath('appData', profile); app.setPath('userData', profile); app.setPath('sessionData', profile); app.setPath('crashDumps', profile)
    // The fixture never reads or writes the user's system clipboard.
    clipboard.has = async () => false; clipboard.read = async () => []
    dialog.showErrorBox = (_title, message) => { console.error('STARTUP_FAILED', message); app.exit(1) }
    let network = 0
    app.on('web-contents-created', (_event, contents) => {
      contents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']}, (_details, callback) => { network++; callback({cancel:true}) })
    })
    app.on('browser-window-created', (_event, win) => { win.show = () => {}; win.showInactive = () => {} })
    require('./production.cjs')
    const assert = (value, message) => { if (!value) throw new Error(message) }
    const wait = async (check, message) => { const until=Date.now()+30000; do { if(await check()) return; await new Promise(done=>setTimeout(done,50)) } while(Date.now()<until); throw new Error(message) }
    app.whenReady().then(async () => {
      try {
        let main
        await wait(async () => { main = BrowserWindow.getAllWindows().find(win=>win.webContents.getURL().includes('/renderer/index.html')); return main && !main.webContents.isLoading() && await main.webContents.executeJavaScript('!!window.devutils') }, 'Production workspace failed to load')
        assert(app.getPath('userData').startsWith(profile + path.sep), 'Production fixture escaped its temporary profile')
        assert(main.webContents.getLastWebPreferences().sandbox && !main.webContents.getLastWebPreferences().devTools, 'Production sandbox/developer-tool policy changed')
        assert(await main.webContents.executeJavaScript('window.devutils.app.language().then(value=>typeof value.resolved === "string")'), 'Production bytecode IPC failed')
        assert(await main.webContents.executeJavaScript('(() => { const api = window.devutils; for (const [owner, name] of [[api.clipboard,"onChanged"],[api.quickTools,"onShortcutsChanged"],[api.securityTesting,"onProgress"],[api.security,"onVaultLocked"],[api.app,"onThemeChanged"],[api.app,"onLanguageChanged"],[api.app,"onOpenTool"],[api.color,"onPicked"],[api.ocr,"onProgress"],[api.file,"onHashProgress"]]) { const cleanup = owner[name](() => {}); if (typeof cleanup !== "function" || cleanup() !== undefined || cleanup() !== undefined) return false }; return true })()'), 'Production subscription cleanup escaped the bridge or failed repeated cancellation')
        console.log('PASS actual production subscriptions unsubscribe repeatedly without returning IPC objects')
        let closeDialog = null
        dialog.showMessageBoxSync = (_window, options) => { closeDialog = options; return 0 }
        await main.webContents.executeJavaScript('window.devutils.app.setLanguage("vi")')
        await main.webContents.executeJavaScript('window.fixtureBeforeUnload = event => { event.preventDefault(); event.returnValue = false }; window.addEventListener("beforeunload", window.fixtureBeforeUnload)')
        main.close()
        await wait(() => closeDialog !== null, 'Native close confirmation did not run')
        const closeCopy = ${JSON.stringify(closeCopy)}
        assert(!main.isDestroyed() && closeDialog.message === closeCopy[0] && closeDialog.buttons[0] === closeCopy[1] && closeDialog.buttons[1] === closeCopy[2], 'Production native close warning ignored the interface language or discarded the window')
        await main.webContents.executeJavaScript('window.removeEventListener("beforeunload", window.fixtureBeforeUnload); delete window.fixtureBeforeUnload; window.devutils.app.setLanguage("en")')
        console.log('PASS actual production native close dialog follows locale and keeps the window open')
        await main.webContents.executeJavaScript('window.devutils.quickTools.open("clipboard")')
        const quick = BrowserWindow.getAllWindows().find(win=>win.webContents.getURL().includes('/renderer/quick.html'))
        assert(quick && quick.webContents.getLastWebPreferences().sandbox && !quick.webContents.getLastWebPreferences().devTools, 'Production widget failed')
        await wait(async()=>await quick.webContents.executeJavaScript('!!window.quickTools'), 'Widget sandbox preload failed')
        quick.destroy()
        // Probe the actual packaged helper HTML/JS/preloads with fixed harmless views.
        for (const [name, preload, channel, view, expression] of [
          ['color-picker', 'colorPicker', 'screenPicker', {kind:'result',color:{hex:'#336699',foreground:'#FFFFFF',contrast:6,rgb:'rgb(51, 102, 153)',hsl:'hsl(210, 50%, 40%)',hsv:'hsv(210, 67%, 60%)'}}, 'document.querySelector("#selected-hex").textContent === "#336699"'],
          ['ocr-helper', 'ocrHelper', 'ocrHelper', {kind:'result',result:{text:'Offline OCR fixture'}}, 'document.querySelector("#text").value === "Offline OCR fixture"']
        ]) {
          ipcMain.removeHandler(channel+':view'); ipcMain.removeHandler(channel+':ready')
          ipcMain.handle(channel+':view', ()=>view); ipcMain.handle(channel+':ready', ()=>{})
          const helper = new BrowserWindow({show:false,webPreferences:{preload:path.join(__dirname,'../preload/'+preload+'.js'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,devTools:false}})
          await helper.loadFile(path.join(__dirname,'helpers/'+name+'.html'))
          await wait(async()=>await helper.webContents.executeJavaScript(expression + ' && document.querySelector(".brand img").naturalWidth > 0'), 'Packaged helper script/logo/preload failed: '+name)
          helper.destroy()
        }
        assert(network === 0, 'Protected offline startup attempted a network request')
        console.log('PROTECTED_HEALTHY: actual production bytecode, workspace IPC, clipboard widget and both ASAR helpers work offline with sandbox')
        app.exit(0)
      } catch(error) { console.error('PROTECTED_FAILED',error.message); app.exit(1) }
    })
  `
  await writeFile(join(fixture, 'out/main/index.cjs'), source)
  await writeFile(join(fixture, 'package.json'), JSON.stringify({ name: 'devfusion-protection-fixture', version: '0.0.0', main: 'out/main/index.cjs', author: 'DevFusion', description: 'Temporary protection fixture', dependencies: { yaml: require('yaml/package.json').version } }))
  const config = join(root, 'builder.json')
  await writeFile(config, JSON.stringify({ extends: null, appId: 'com.devfusion.protection-fixture', productName: 'DevFusionProtection', electronVersion: require('electron/package.json').version,
    directories: { app: fixture, output, buildResources: resolve('resources') }, files: ['out/**/*', 'package.json'], asar: true, afterPack: resolve('scripts/after-pack.mjs'), publish: null,
    win: { signAndEditExecutable: false }, mac: { identity: null, notarize: false }, linux: { executableName: 'devfusion-protection' } }))
  const packed = await run(process.execPath, [require.resolve('electron-builder/cli.js'), '--projectDir', fixture, '--dir', '--' + process.arch, '--config', config, '--publish', 'never'], 180000)
  assert(packed.code === 0, 'Protection fixture packaging failed\n' + packed.stdout + packed.stderr)
  let binary, entry
  if (process.platform === 'darwin') {
    const dir = (await readdir(output)).find(name => /^mac(?:-|$)/.test(name))
    assert(dir, 'macOS fixture missing')
    binary = join(output, dir, 'DevFusionProtection.app'); entry = join(binary, 'Contents/MacOS/DevFusionProtection')
  } else { binary = join(output, process.platform === 'win32' ? 'win-unpacked/DevFusionProtection.exe' : 'linux-unpacked/devfusion-protection'); entry = binary }
  const { archive, inspection, embedded } = await verifyPackageIntegrity(binary)
  const healthy = await run(entry, [])
  assert(healthy.code === 0 && healthy.stdout.includes('PROTECTED_HEALTHY'), 'Production bytecode execution failed\n' + healthy.stdout + healthy.stderr)
  console.log(healthy.stdout.trim())
  const tamper = async (name, position) => {
    const file = await open(archive, 'r+')
    const byte = Buffer.alloc(1)
    try { await file.read(byte, 0, 1, position); await file.write(Buffer.from([byte[0] ^ 1]), 0, 1, position); await file.sync() } finally { await file.close() }
    try {
      let rejected = false
      try { await verifyPackageIntegrity(binary) } catch { rejected = true }
      assert(rejected, 'Package verifier accepted tampered ' + name)
      if (embedded) {
        const changed = await run(entry, [], 30000)
        assert(changed.code !== 0 && !changed.stdout.includes('PROTECTED_HEALTHY') && /integrity|Failed to validate.*ASAR/i.test(changed.stderr + changed.stdout), 'Electron did not reject tampered ' + name + '\n' + changed.stdout + changed.stderr)
      }
      console.log('PASS tampered ' + name + (embedded ? ' refused by native Electron and verifier' : ' refused by build verifier; native enforcement unsupported on Linux'))
    } finally {
      const restore = await open(archive, 'r+')
      try { await restore.write(byte, 0, 1, position); await restore.sync() } finally { await restore.close() }
    }
  }
  for (const name of ['out/main/index.cjsc', 'out/main/helpers/color-picker.js', 'out/main/helpers/ocr-helper.js']) {
    const file = inspection.files.get(name); assert(file && !file.unpacked, 'Protected file absent from ASAR: ' + name)
    await tamper(name, inspection.dataOffset + Number(file.offset) + Math.min(64, file.size - 1))
  }
  const file = await open(archive, 'r')
  const header = Buffer.alloc(inspection.dataOffset)
  try { await file.read(header, 0, header.length, 0) } finally { await file.close() }
  const offset = header.indexOf(Buffer.from('"hash":"'))
  assert(offset >= 0, 'Header hash fixture missing')
  await tamper('ASAR header', offset + 8)
  await verifyPackageIntegrity(binary)
} finally {
  const target = resolve(root)
  if (!target.startsWith(resolve(tmpdir()) + sep) || !basename(target).startsWith('devfusion-protection-')) throw new Error('Unexpected fixture cleanup path')
  await rm(target, { recursive: true, force: true, maxRetries: 12, retryDelay: 250 })
}
