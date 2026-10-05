import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtemp, rm, mkdir, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join, basename, sep } from 'node:path'
import { spawn } from 'node:child_process'

// Native controllers with a temporary profile. No real vault, clipboard read,
// screenshot or operating-system pixel selection is performed by this fixture.
const root = await mkdtemp(join(tmpdir(), 'devfusion-tray-'))
try {
  await mkdir(join(root, 'resources'))
  for (const name of ['tray.png', 'tray.ico', 'trayTemplate.png', 'trayTemplate@2x.png', 'color-picker.html']) await copyFile(resolve('resources', name), join(root, 'resources', name))
  const entry = join(root, 'smoke.cjs')
  const source = `
    import { app, BrowserWindow } from 'electron'
    import { mkdir, writeFile, readFile } from 'fs/promises'
    import { mkdirSync, writeFileSync } from 'fs'
    import { join } from 'path'
    import { configureBrand } from './src/main/branding'
    import { DesktopTray } from './src/main/tray'
    import { ScreenColorPicker } from './src/main/color-picker'
    import { DesktopOcr } from './src/main/ocr'
    const root = ${JSON.stringify(root)}, renderer = ${JSON.stringify(resolve('out/renderer/index.html'))}
    app.setPath('appData', root); app.setPath('crashDumps', root)
    const legacy = join(root,'devutils'); mkdirSync(legacy); writeFileSync(join(legacy,'fixture.secret'), 'existing fixture bytes')
    configureBrand()
    app.commandLine.appendSwitch('disable-features', 'SpareRendererForSitePerProcess')
    let desktop, win, helpers = []
    const assert = (ok, message) => { if (!ok) throw new Error(message) }
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
    const metrics = () => ({ rssMiB: Math.round(app.getAppMetrics().reduce((total,item)=> total+(item.memory?.workingSetSize??0),0)/1024), privateMiB: Math.round(app.getAppMetrics().reduce((total,item)=> total+(item.memory?.privateBytes??0),0)/1024), renderers: app.getAppMetrics().filter(item=>item.type==='Tab').length })
    const create = route => {
      win = new BrowserWindow({ show: false, title: 'DevFusion', webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } })
      void win.loadFile(renderer, {hash: route})
      return win
    }
    app.on('window-all-closed', () => {})
    app.whenReady().then(async () => {
      try {
        assert(app.getName()==='DevFusion' && app.getPath('userData')===legacy && app.getPath('sessionData')===legacy, 'Brand rename moved storage')
        assert(await readFile(join(legacy,'fixture.secret'),'utf8')==='existing fixture bytes', 'Brand rename changed legacy data')
        const picker = new ScreenColorPicker()
        desktop = new DesktopTray(create, picker, () => app.quit(), new DesktopOcr())
        const beforeTray = metrics()
        assert(desktop.start(), 'Native tray could not be created')
        const trayOnly = metrics()
        assert(BrowserWindow.getAllWindows().length===0, 'Idle tray created a renderer')
        console.log('PASS native tray starts without a BrowserWindow; brand preserves legacy data')
        console.log('MEMORY cold before tray='+JSON.stringify(beforeTray)+' after tray='+JSON.stringify(trayOnly))
        desktop.open('design.color')
        await new Promise(resolve => win.webContents.once('did-finish-load', resolve))
        await sleep(1000)
        assert(win.webContents.getURL().includes('#/tool/design.color'), 'Tray did not load Color Picker route')
        const opened = metrics()
        const first = win
        desktop.open('json.studio')
        assert(win === first && BrowserWindow.getAllWindows().length===1, 'Tray created a second main window')
        // Route messaging is tested through the production preload/UI fixture separately.
        win.destroy(); await sleep(2000)
        const idle = metrics()
        assert(BrowserWindow.getAllWindows().length===0 && idle.renderers===0, 'Idle tray retained a renderer')
        console.log('PASS closing the main window releases all renderers; opened='+JSON.stringify(opened)+' idle='+JSON.stringify(idle))
        desktop.open('base64.codec')
        await new Promise(resolve => win.webContents.once('did-finish-load', resolve))
        assert(win !== first && win.webContents.getURL().includes('base64.codec'), 'Tray failed to recreate the chosen tool')
        win.destroy()
        console.log('PASS native reopen; desktop capture/popup covered by electron-color-picker.smoke.mjs')
        desktop.dispose(); assert(!desktop.hasTray(), 'Quit retained native tray')
        console.log('PASS native tray disposal')
        app.exit(0)
      } catch(error) { console.error('SMOKE FAILED', error.message); if(win&&!win.isDestroyed()) win.destroy(); for(const item of helpers) if(!item.isDestroyed()) item.destroy(); desktop?.dispose(); app.exit(1) }
    })
  `
  await build({ stdin: { contents: source, resolveDir: process.cwd(), loader: 'ts' }, outfile: entry, bundle: true, platform: 'node', format: 'cjs', packages: 'external', alias: { '@shared': resolve('src/shared') } })
  const electron = createRequire(import.meta.url)('electron')
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(electron, [entry], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.pipe(process.stdout); child.stderr.pipe(process.stderr)
  let timer
  const code = await new Promise((done, reject) => {
    timer = setTimeout(() => { child.kill(); reject(new Error('Native tray smoke exceeded 45 seconds')) }, 45000)
    child.once('error', reject); child.once('exit', done)
  }).finally(() => clearTimeout(timer))
  if (code !== 0) throw new Error('Native tray smoke exited ' + code)
} finally {
  const target = resolve(root)
  if (!target.startsWith(resolve(tmpdir()) + sep) || !basename(target).startsWith('devfusion-tray-')) throw new Error('Unexpected cleanup path')
  await rm(target, { recursive: true, force: true })
}
