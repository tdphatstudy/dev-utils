import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join, basename, sep } from 'node:path'
import { spawn } from 'node:child_process'

// Production preload + actual service/proxy; isolated profile, memory hosts,
// public TEST-ONLY TLS fixture. Never edits real hosts or a trust store.
const root = await mkdtemp(join(tmpdir(), 'devfusion-local-domains-'))
try {
  const entry = join(root, 'smoke.cjs')
  const source = `
    import { app, BrowserWindow, ipcMain } from 'electron'
    import { createServer, request } from 'node:http'
    import { request as tlsRequest } from 'node:https'
    import { readFile } from 'node:fs/promises'
    import { pathToFileURL } from 'node:url'
    import { LocalDomainsService } from './src/main/local-domains/service'
    import { registerLocalDomainsIpc } from './src/main/local-domains/ipc'
    import { patchManagedHosts, managedHostDomains } from './src/shared/local-domains/hosts'
    import { configureWindowSecurity } from './src/main/window-security'
    const root = ${JSON.stringify(root)}
    const renderer = ${JSON.stringify(resolve('out/renderer/index.html'))}
    const preload = ${JSON.stringify(resolve('out/preload/index.js'))}
    app.setPath('userData', root); app.setPath('sessionData', root); app.setPath('crashDumps', root)
    app.commandLine.appendSwitch('disable-features', 'SpareRendererForSitePerProcess')
    const expected = pathToFileURL(renderer).href
    process.env.ELECTRON_RENDERER_URL = expected
    let hosts = '# FIXTURE ONLY\\n127.0.0.1 localhost\\n', edits = 0, issued = 0
    const initial = hosts, windows = []
    const adapter = {
      read: async () => hosts,
      set: async (domain, enabled) => { edits++; hosts = patchManagedHosts(hosts, domain, enabled); return null },
      removeAll: async () => { edits++; hosts = managedHostDomains(hosts).reduce((text, domain) => patchManagedHosts(text, domain, false), hosts); return null }
    }
    const certs = {
      available: async () => true, installed: async () => true, install: async () => {}, uninstall: async () => {}, remove: async () => {},
      issue: async () => { issued++; return { cert: await readFile(${JSON.stringify(resolve('src/main/local-domains/fixtures/TEST-ONLY-cert.pem'))}), key: await readFile(${JSON.stringify(resolve('src/main/local-domains/fixtures/TEST-ONLY-key.pem'))}) } }
    }
    const service = new LocalDomainsService(root, adapter, certs)
    const assert = (ok, message) => { if (!ok) throw new Error(message) }
    const freePort = async () => { const s = createServer(); await new Promise(ok => s.listen(0, '127.0.0.1', ok)); const p = s.address().port; await new Promise(ok => s.close(ok)); return p }
    const create = async trusted => {
      const win = new BrowserWindow({ show: false, webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } })
      windows.push(win)
      if (trusted) { configureWindowSecurity(win, expected, async () => {}); await win.loadURL(expected + '#/tool/network.local-domains') }
      else await win.loadURL('about:blank')
      return win
    }
    const invoke = (win, method, value) => win.webContents.executeJavaScript('window.devutils.localDomains.' + method + '(' + (value === undefined ? '' : JSON.stringify(value)) + ')')
    const fetchProxy = (port, secure = false) => new Promise((done, reject) => {
      const req = (secure ? tlsRequest : request)({ host: '127.0.0.1', port, headers: { Host: 'app.test' }, servername: 'app.test', rejectUnauthorized: false, agent: false }, res => { let text = ''; res.on('data', chunk => text += chunk); res.on('end', () => done({ code: res.statusCode, text })) })
      req.setTimeout(3000, () => req.destroy(new Error('Fixture request timed out'))); req.on('error', reject); req.end()
    })
    const upstream = createServer((req, res) => res.end('fixture app'))
    app.on('window-all-closed', () => {})
    app.on('will-quit', () => { service.dispose(); upstream.close(); upstream.closeAllConnections() })
    app.whenReady().then(async () => {
      try {
        registerLocalDomainsIpc(service)
        ipcMain.handle('app:platform', () => process.platform); ipcMain.handle('app:version', () => app.getVersion())
        ipcMain.handle('app:trayAvailable', () => true); ipcMain.handle('window:isMaximized', () => false)
        ipcMain.handle('privateBox:ensureDefault', () => ({ id: 'domains-fixture' }))
        const win = await create(true)
        assert(edits === 0 && issued === 0, 'Opening the tool performed OS/certificate work')
        const ports = { http: await freePort(), https: await freePort() }
        await invoke(win, 'setPorts', ports)
        await new Promise(ok => upstream.listen(0, '::1', ok))
        const saved = await invoke(win, 'add', { domain: 'app.test', targetPort: upstream.address().port, https: true })
        const id = saved.entries[0].id
        assert(!saved.entries[0].active && edits === 0 && issued === 0, 'Saving changed OS state')
        const active = await invoke(win, 'enable', id)
        assert(active.entries[0].active && active.entries[0].hostsMapped && issued === 1, 'Production bridge Enable failed')
        assert((await fetchProxy(ports.http)).code === 307, 'HTTPS redirect failed')
        assert((await fetchProxy(ports.https, true)).text === 'fixture app', 'Native TLS forwarding failed')
        hosts = patchManagedHosts(hosts, 'app.test', false)
        const missing = await invoke(win, 'status')
        assert(missing.entries[0].active && !missing.entries[0].hostsMapped, 'External hosts removal was not detected')
        const repaired = await invoke(win, 'enable', id)
        assert(repaired.entries[0].active && repaired.entries[0].hostsMapped && issued === 1, 'Repair rebound the route or reissued its certificate')
        assert((await fetchProxy(ports.https, true)).text === 'fixture app', 'Repaired domain lost TLS forwarding')
        const untrusted = await create(false)
        let denied = false
        try { await invoke(untrusted, 'disable', id) } catch (error) { denied = error.message.includes('app window') }
        assert(denied && (await service.status()).entries[0].active, 'Untrusted window disabled the proxy')
        untrusted.destroy(); win.destroy()
        assert(BrowserWindow.getAllWindows().length === 0 && (await fetchProxy(ports.https, true)).text === 'fixture app', 'Tray lifetime lost domain route')
        console.log('PASS production preload/trusted IPC: idle/save no OS work; actual HTTP/TLS to IPv6 localhost; external hosts removal repaired without reissuing TLS; untrusted window blocked; active with zero windows')
        const second = await create(true)
        assert((await invoke(second, 'status')).entries[0].active, 'Reopened renderer lost live state')
        await invoke(second, 'cleanup')
        assert(hosts === initial && !(await service.status()).entries[0].active, 'Cleanup did not restore hosts fixture')
        let closed = false
        try { await fetchProxy(ports.https, true) } catch { closed = true }
        assert(closed, 'Cleanup left a TLS listener open')
        await invoke(second, 'remove', id)
        assert((await invoke(second, 'status')).entries.length === 0, 'Remove retained metadata')
        second.destroy(); service.dispose(); upstream.close(); upstream.closeAllConnections()
        console.log('PASS renderer reopen, batch cleanup restores original hosts and closes listener, metadata removal')
        app.exit(0)
      } catch (error) {
        console.error('SMOKE FAILED', error.message); service.dispose(); upstream.close(); upstream.closeAllConnections(); windows.forEach(win => { if (!win.isDestroyed()) win.destroy() }); app.exit(1)
      }
    })
  `
  await build({ stdin: { contents: source, resolveDir: process.cwd(), loader: 'ts' }, outfile: entry, bundle: true, platform: 'node', format: 'cjs', external: ['electron'], alias: { '@shared': resolve('src/shared') } })
  const electron = createRequire(import.meta.url)('electron'), env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(electron, [entry], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.pipe(process.stdout); child.stderr.pipe(process.stderr)
  let timer
  const code = await new Promise((done, reject) => { timer = setTimeout(() => { child.kill(); reject(new Error('Native Local Domains smoke exceeded 45 seconds')) }, 45000); child.once('error', reject); child.once('exit', done) }).finally(() => clearTimeout(timer))
  if (code !== 0) throw new Error('Native Local Domains smoke exited ' + code)
} finally {
  const target = resolve(root)
  if (!target.startsWith(resolve(tmpdir()) + sep) || !basename(target).startsWith('devfusion-local-domains-')) throw new Error('Unexpected cleanup path')
  await rm(target, { recursive: true, force: true })
}
