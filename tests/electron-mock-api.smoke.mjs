import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join, basename, sep } from 'node:path'
import { spawn } from 'node:child_process'

// Hidden fixture windows and ephemeral loopback HTTP server, isolated profile.
// No user vault, clipboard writes or real application data are accessed.
const root = await mkdtemp(join(tmpdir(), 'devfusion-mock-api-'))
try {
  const entry = join(root, 'smoke.cjs')
  const source = `
    import { app, BrowserWindow, ipcMain } from 'electron'
    import { createServer } from 'node:net'
    import { pathToFileURL } from 'node:url'
    import { MockApiServer } from './src/main/mock-api-server'
    import { registerMockApiIpc } from './src/main/mock-api-ipc'
    import { configureWindowSecurity } from './src/main/window-security'
    import { MOCK_EXAMPLE_YAML, parseMockConfig, serializeMockConfig } from './src/shared/mock-api'
    const root = ${JSON.stringify(root)}
    const renderer = ${JSON.stringify(resolve('out/renderer/index.html'))}
    const preload = ${JSON.stringify(resolve('out/preload/index.js'))}
    app.setPath('userData', root); app.setPath('sessionData', root); app.setPath('crashDumps', root)
    app.commandLine.appendSwitch('disable-features', 'SpareRendererForSitePerProcess')
    const expected = pathToFileURL(renderer).href
    process.env.ELECTRON_RENDERER_URL = expected
    const mock = new MockApiServer()
    const windows = []
    const assert = (ok, message) => { if (!ok) throw new Error(message) }
    const sleep = ms => new Promise(ok => setTimeout(ok, ms))
    const create = async (trusted = true) => {
      const win = new BrowserWindow({ show: false, webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } })
      windows.push(win)
      if (trusted) { configureWindowSecurity(win, expected, async () => {}); await win.loadURL(expected + '#/tool/network.mock-api') }
      else await win.loadURL('about:blank')
      return win
    }
    const invoke = (win, method, argument) => win.webContents.executeJavaScript('window.devutils.mockApi.' + method + '(' + (argument === undefined ? '' : JSON.stringify(argument)) + ')')
    app.on('window-all-closed', () => {})
    app.on('will-quit', () => mock.dispose())
    app.whenReady().then(async () => {
      try {
        registerMockApiIpc(mock)
        ipcMain.handle('app:platform', () => process.platform); ipcMain.handle('app:version', () => app.getVersion())
        ipcMain.handle('app:trayAvailable', () => true); ipcMain.handle('window:isMaximized', () => false)
        ipcMain.handle('privateBox:ensureDefault', () => ({ id: 'mock-fixture' }))
        assert(!mock.status().running && BrowserWindow.getAllWindows().length === 0, 'Idle mock created a server/window')
        const reservation = createServer()
        await new Promise(ok => reservation.listen(0, '127.0.0.1', ok))
        const port = reservation.address().port
        await new Promise(ok => reservation.close(ok))
        const config = parseMockConfig(MOCK_EXAMPLE_YAML); config.port = port
        const yaml = serializeMockConfig(config)
        const first = await create()
        assert((await invoke(first, 'status')).running === false, 'Preload idle status failed')
        const started = await invoke(first, 'start', yaml)
        assert(started.running && started.port === port, 'Native preload did not start real HTTP listener')
        const headers = { Authorization: 'Bearer fixture-secret', Origin: 'http://localhost:5173' }
        const response = await fetch(started.baseUrl + '/api/users?role=admin', { headers })
        const payload = await response.json()
        assert(response.status === 200 && payload.users.length === 1 && payload.users[0].role === 'admin', 'Real HTTP conditional response mismatch')
        assert(response.headers.get('access-control-allow-origin') === 'http://localhost:5173', 'Frontend CORS failed')
        const denied = await fetch(started.baseUrl + '/api/users', { headers: { Origin: 'https://untrusted.invalid' } })
        assert(denied.status === 403, 'Remote origin could read local mock')
        const logs = (await invoke(first, 'status')).logs
        assert(!JSON.stringify(logs).includes('fixture-secret') && !JSON.stringify(logs).includes('role=admin'), 'Native activity leaked request content')
        console.log('PASS production preload/trusted IPC starts actual localhost API, conditional response and CORS')
        const untrusted = await create(false)
        let refused = false
        try { await invoke(untrusted, 'stop') } catch (error) { refused = error.message.includes('app window') }
        assert(refused && mock.status().running, 'Untrusted native window stopped the server')
        untrusted.destroy(); first.destroy()
        await sleep(200)
        assert(BrowserWindow.getAllWindows().length === 0 && mock.status().running, 'Closing renderer stopped explicit background server')
        assert((await fetch(started.baseUrl + '/api/users', { headers: { Authorization: 'sample' } })).status === 200, 'Tray-lifetime server was inaccessible')
        console.log('PASS untrusted sender blocked and server stays usable with zero windows')
        const second = await create()
        assert((await invoke(second, 'getConfig')).includes('List users'), 'Reopened renderer lost active configuration')
        await invoke(second, 'clearLogs')
        assert((await invoke(second, 'status')).logs.length === 0, 'Clear activity failed')
        const stopped = await invoke(second, 'stop')
        assert(!stopped.running && stopped.logs.length === 0 && await invoke(second, 'getConfig') === null, 'Stop retained active content')
        let closed = false
        try { await fetch(started.baseUrl + '/api/users', { signal: AbortSignal.timeout(2000) }) } catch { closed = true }
        assert(closed, 'Stop left listener accessible')
        await invoke(second, 'start', yaml)
        mock.dispose(); second.destroy()
        assert(!mock.status().running && mock.getConfig() === null && BrowserWindow.getAllWindows().length === 0, 'Quit cleanup retained config/windows')
        console.log('PASS reopen retrieves active config; Stop/restart/dispose releases listener and RAM state')
        app.exit(0)
      } catch (error) {
        console.error('SMOKE FAILED', error.message); mock.dispose(); windows.forEach(win => { if (!win.isDestroyed()) win.destroy() }); app.exit(1)
      }
    })
  `
  await build({ stdin: { contents: source, resolveDir: process.cwd(), loader: 'ts' }, outfile: entry, bundle: true, platform: 'node', format: 'cjs', external: ['electron'], alias: { '@shared': resolve('src/shared') } })
  const electron = createRequire(import.meta.url)('electron')
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(electron, [entry], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.pipe(process.stdout); child.stderr.pipe(process.stderr)
  let timer
  const code = await new Promise((done, reject) => {
    timer = setTimeout(() => { child.kill(); reject(new Error('Native Mock API smoke exceeded45 seconds')) }, 45000)
    child.once('error', reject); child.once('exit', done)
  }).finally(() => clearTimeout(timer))
  if (code !== 0) throw new Error('Native Mock API smoke exited ' + code)
} finally {
  const target = resolve(root)
  if (!target.startsWith(resolve(tmpdir()) + sep) || !basename(target).startsWith('devfusion-mock-api-')) throw new Error('Unexpected cleanup path')
  await rm(target, { recursive: true, force: true })
}
