import { createServer } from 'node:http'
import { readFile, mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { resolve, extname, sep, basename, join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'

// Production renderer in an isolated profile. This measures navigation-to-paint,
// not installed Electron startup, OS RSS, or processing real user documents.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = resolve('out/renderer')
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }
const server = createServer(async (request, response) => {
  try {
    const path = resolve(root, '.' + new URL(request.url, 'http://localhost').pathname)
    if (!path.startsWith(root + sep)) { response.writeHead(403).end(); return }
    const body = await readFile(path)
    response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Content-Length': body.byteLength })
    response.end(body)
  } catch { response.writeHead(404).end() }
})
const browser = await chromium.launch({ channel: process.env.UX_BROWSER_CHANNEL || undefined, headless: true })
await new Promise(done => server.listen(0, '127.0.0.1', done))
const url = `http://127.0.0.1:${server.address().port}/index.html`
const tools = [
  ['text.lorem', 'Lorem Text', '#lorem-output'],
  ['time.timestamp', 'Timestamp Converter', '#timestamp-input'],
  ['json.studio', 'JSON Studio', '.cm-content[aria-label="JSON input"]'],
  ['yaml.studio', 'YAML Studio', '.cm-content[aria-label="YAML input"]', 'Valid YAML'],
  ['sql.studio', 'SQL Studio', '.cm-content[aria-label="MySQL input"]'],
  ['text.regex', 'Regex', 'input[aria-label="Regex pattern"]', '\\d+ matches'],
  ['network.mock-api', 'Mock API', '[role="tablist"]'],
  ['text.ocr', 'OCR', 'textarea[aria-label="Extracted text"]']
]
const errors = [], rows = []
let native = null
const rounds = Math.max(1, Math.min(10, Number(process.env.PERF_ROUNDS || 3)))
async function fixture(page) {
  await page.addInitScript(() => {
    window.devutils = {
      platform: async () => 'win32',
      window: { minimize() {}, maximize() {}, close() {}, isMaximized: async () => false },
      app: { trayAvailable: async () => true, onOpenTool: () => () => {} },
      privateBox: { ensureDefault: async () => ({ id: 'fixture' }) },
      mockApi: { status: async () => ({ running: false, port: null, baseUrl: null, name: null, startedAt: null, requests: 0, logs: [] }), getConfig: async () => null },
      ocr: { lastResult: async () => null, onResult: () => () => {}, onProgress: () => () => {} }
    }
    window.__longTasks = []
    new PerformanceObserver(list => window.__longTasks.push(...list.getEntries().map(entry => ({ startTime: entry.startTime, duration: entry.duration })))).observe({ type: 'longtask', buffered: true })
    window.__workerEvents = []
    const BrowserWorker = window.Worker
    window.Worker = class extends BrowserWorker {
      constructor(url, options) {
        super(url, options)
        this.fixtureEvent = { url: String(url), createdAt: performance.now(), terminatedAt: null }
        window.__workerEvents.push(this.fixtureEvent)
      }
      terminate() { this.fixtureEvent.terminatedAt = performance.now(); return super.terminate() }
    }
  })
  page.on('pageerror', error => errors.push(error.message))
}
async function openTool(page, tool, phase, cdp, round) {
  const [id, name, selector, resultPattern] = tool
  const before = (await cdp.send('Performance.getMetrics')).metrics
  const measurement = await page.evaluate(async ({ id, selector, resultPattern }) => {
    performance.clearResourceTimings()
    const startedAt = performance.now()
    const homeHeap = performance.memory?.usedJSHeapSize ?? null
    const ready = () => {
      const node = document.querySelector('main ' + selector)
      return node && node.getBoundingClientRect().height > 0
    }
    location.hash = '#/tool/' + id
    let headingAt = null, readyAt = null
    await new Promise((done, reject) => {
      const timeout = setTimeout(() => reject(new Error('Tool ready timeout: ' + id)), 12000)
      const frame = () => {
        if (headingAt === null && document.querySelector('main h1')) headingAt = performance.now()
        if (!ready()) { requestAnimationFrame(frame); return }
        readyAt = performance.now()
        requestAnimationFrame(() => { clearTimeout(timeout); done() })
      }
      requestAnimationFrame(frame)
    })
    const paintedMs = performance.now() - startedAt
    let resultMs = paintedMs
    if (resultPattern) await new Promise((done, reject) => {
      const timeout = setTimeout(() => reject(new Error('Tool result timeout: ' + id)), 12000)
      const pattern = new RegExp(resultPattern)
      const frame = () => {
        if (![...document.querySelectorAll('main [role="status"]')].some(node => pattern.test(node.textContent))) { requestAnimationFrame(frame); return }
        resultMs = performance.now() - startedAt
        clearTimeout(timeout); done()
      }
      requestAnimationFrame(frame)
    })
    return {
      headerMs: headingAt - startedAt,
      readyMs: readyAt - startedAt,
      paintedMs,
      resultMs,
      jsHeapBeforeBytes: homeHeap,
      jsHeapAfterBytes: performance.memory?.usedJSHeapSize ?? null,
      longTasks: window.__longTasks.filter(task => task.startTime >= startedAt),
      resources: performance.getEntriesByType('resource').map(entry => ({ name: entry.name, durationMs: entry.duration, decodedBytes: entry.decodedBodySize, transferBytes: entry.transferSize }))
    }
  }, { id, selector, resultPattern })
  const after = (await cdp.send('Performance.getMetrics')).metrics
  const metric = (list, name) => list.find(item => item.name === name)?.value ?? 0
  const cpu = Object.fromEntries(['ScriptDuration', 'TaskDuration', 'LayoutDuration', 'RecalcStyleDuration'].map(name => [name + 'Ms', (metric(after, name) - metric(before, name)) * 1000]))
  rows.push({ id, name, phase, round, ...measurement, resources: measurement.resources.map(entry => ({ ...entry, name: basename(new URL(entry.name).pathname) })), ...cpu })
  assert.ok(!measurement.resources.some(entry => /ocr\/(?:eng|vie)|tesseract|pdf\.worker|ocr\.html/i.test(entry.name)), 'Navigation loaded OCR engine/models without an extraction action')
  if (id === 'json.studio' && phase === 'cold' && process.env.PERF_ALLOW_EAGER_EDITOR !== '1') assert.ok(measurement.resources.some(entry => /\/vendor-codemirror-/.test(entry.name)), 'Opening JSON did not load the lazy editor bundle')
  if (phase === 'warm') assert.ok(!measurement.resources.some(entry => /\/(?:LoremTool|TimestampTool|JsonStudio|YamlStudio|SqlStudio|RegexTool|MockApiTool|OcrTool|vendor-sql|vendor-codemirror)-/.test(entry.name)), 'Reopening a tool fetched its cached module graph again')
  await page.evaluate(() => { location.hash = '#/' })
  await page.getByRole('heading', { name: 'DevFusion', exact: true }).waitFor()
}
async function workerLifecycleRegression() {
  const context = await browser.newContext({ viewport: { width: 1180, height: 760 } })
  const page = await context.newPage()
  page.setDefaultTimeout(12000)
  await fixture(page)
  for (const [id, label, next, expected] of [
    ['yaml.studio', 'YAML input', 'fixtureLatest: final-value', 'final-value'],
    ['text.regex', 'Regex pattern', 'fixture-final', '0 matches']
  ]) {
    await page.goto(url + '#/tool/' + id)
    await page.getByRole('status').filter({ hasText: id === 'yaml.studio' ? 'Valid YAML' : /\d+ matches/ }).waitFor()
    assert.equal(await page.evaluate(() => window.__workerEvents.every(event => event.terminatedAt !== null)), true, 'Completed analysis retained a worker')
    await page.evaluate(() => { window.__workerEvents = []; window.__fixtureEditAt = performance.now() })
    await page.getByRole('textbox', { name: label, exact: true }).fill(next)
    await page.getByRole('status').filter({ hasText: id === 'yaml.studio' ? 'Valid YAML' : expected }).waitFor()
    const edited = await page.evaluate(() => ({ workers: window.__workerEvents, editedAt: window.__fixtureEditAt }))
    assert.equal(edited.workers.length, 1, 'An input edit launched more than one analysis worker')
    assert.ok(edited.workers[0].createdAt - edited.editedAt >= 150, 'Typing debounce was removed')
    assert.ok(edited.workers[0].terminatedAt !== null, 'Edited analysis retained its worker')
    // A quick navigation before the next debounce expires must cancel the job.
    await page.evaluate(() => { window.__workerEvents = [] })
    await page.getByRole('textbox', { name: label, exact: true }).fill(next + (id === 'yaml.studio' ? '\ncanceled: later' : '-later'))
    await page.evaluate(() => { location.hash = '#/' })
    await page.getByRole('heading', { name: 'DevFusion', exact: true }).waitFor()
    await page.waitForTimeout(250)
    assert.equal(await page.evaluate(() => window.__workerEvents.length), 0, 'Unmounted tool launched a worker')
    await page.evaluate(id => { location.hash = '#/tool/' + id }, id)
    await page.getByRole('status').filter({ hasText: id === 'yaml.studio' ? 'Valid YAML' : expected }).waitFor()
    if (id === 'yaml.studio') assert.equal(await page.getByRole('textbox', { name: label, exact: true }).locator('.cm-line').allTextContents().then(lines => lines.join('\n')), next + '\ncanceled: later')
    if (id === 'text.regex') assert.equal(await page.getByRole('textbox', { name: label, exact: true }).inputValue(), next + '-later')
    if (id === 'yaml.studio') await page.getByText('"final-value"', { exact: true }).waitFor()
    assert.equal(await page.evaluate(() => window.__workerEvents.every(event => event.terminatedAt !== null)), true, 'Restored draft analysis retained a worker')
  }
  await context.close()
  console.log('PASS YAML/Regex edit debounce, completed worker disposal, pending-unmount cancellation and restored-draft result')
}
async function nativeMemorySample() {
  const directory = await mkdtemp(join(tmpdir(), 'devfusion-loading-perf-'))
  try {
    const entry = join(directory, 'fixture.cjs')
    const output = join(directory, 'metrics.json')
    await writeFile(entry, `
      const { app, BrowserWindow } = require('electron')
      const { writeFileSync } = require('node:fs')
      const directory = ${JSON.stringify(directory)}, output = ${JSON.stringify(output)}, renderer = ${JSON.stringify(join(root, 'index.html'))}
      app.setPath('userData', directory); app.setPath('sessionData', directory); app.setPath('crashDumps', directory)
      app.on('window-all-closed', () => {})
      const sleep = ms => new Promise(done => setTimeout(done, ms))
      const snapshots = []
      let win
      const sample = async label => {
        await sleep(250)
        snapshots.push({ label, jsHeapApproxBytes: win && !win.isDestroyed() ? await win.webContents.executeJavaScript('performance.memory?.usedJSHeapSize ?? null') : null,
          processes: app.getAppMetrics().map(item => ({ type: item.type, workingSetKiB: item.memory.workingSetSize, privateBytesKiB: item.memory.privateBytes ?? null })) })
      }
      const waitFor = async selector => {
        const deadline = Date.now() + 12000
        while (Date.now() < deadline) {
          if (await win.webContents.executeJavaScript('!!document.querySelector(' + JSON.stringify(selector) + ')')) return
          await sleep(20)
        }
        throw new Error('Native readiness timed out: ' + selector)
      }
      app.whenReady().then(async () => {
        try {
          await sample('Before renderer')
          win = new BrowserWindow({ show: false, width: 1180, height: 760, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: false } })
          await win.loadFile(renderer, { hash: '/' }); await waitFor('main h1'); await sample('Home')
          await win.webContents.executeJavaScript("location.hash = '#/tool/json.studio'"); await waitFor('main .cm-content[aria-label="JSON input"]'); await sample('JSON')
          await win.webContents.executeJavaScript("location.hash = '#/tool/sql.studio'"); await waitFor('main .cm-content[aria-label="MySQL input"]'); await sample('SQL')
          await win.webContents.executeJavaScript("location.hash = '#/'"); await waitFor('main h1'); await sample('Home after tools')
          win.destroy(); await sleep(1000); await sample('Window destroyed')
          if (snapshots.at(-1).processes.some(item => item.type === 'Tab')) throw new Error('Destroyed fixture retained a renderer process')
          writeFileSync(output, JSON.stringify({ electron: process.versions.electron, chromium: process.versions.chrome, platform: process.platform, snapshots }))
          app.exit(0)
        } catch (error) { console.error(error); if (win && !win.isDestroyed()) win.destroy(); app.exit(1) }
      })
    `)
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
    const executable = process.env.ELECTRON_PATH || resolve('node_modules/electron/dist/electron.exe')
    const child = spawn(executable, [entry], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = '', timer
    child.stderr.on('data', data => { stderr += data })
    const code = await new Promise((done, reject) => {
      timer = setTimeout(() => { child.kill(); reject(new Error('Native loading fixture exceeded 45 seconds')) }, 45000)
      child.once('error', reject); child.once('exit', done)
    }).finally(() => clearTimeout(timer))
    assert.equal(code, 0, 'Native memory fixture failed: ' + stderr)
    const report = JSON.parse(await readFile(output, 'utf8'))
    console.table(report.snapshots.map(snapshot => ({ phase: snapshot.label, rendererWorkingSetMiB: Math.round(snapshot.processes.filter(item => item.type === 'Tab').reduce((total, item) => total + item.workingSetKiB, 0) / 1024), rendererPrivateMiB: Math.round(snapshot.processes.filter(item => item.type === 'Tab').reduce((total, item) => total + (item.privateBytesKiB || 0), 0) / 1024), rendererCount: snapshot.processes.filter(item => item.type === 'Tab').length })))
    console.log('PASS isolated native Electron memory snapshots and renderer disposal')
    return report
  } finally {
    const target = resolve(directory)
    if (!target.startsWith(resolve(tmpdir()) + sep) || !basename(target).startsWith('devfusion-loading-perf-')) throw new Error('Unexpected fixture cleanup path')
    await rm(target, { recursive: true, force: true })
  }
}
try {
  for (let round = 1; round <= rounds; round++) {
    for (const tool of tools) {
      const context = await browser.newContext({ viewport: { width: 1180, height: 760 } })
      const page = await context.newPage()
      await fixture(page)
      const cdp = await context.newCDPSession(page)
      await cdp.send('Performance.enable')
      await page.goto(url + '#/')
      await page.getByRole('heading', { name: 'DevFusion', exact: true }).waitFor()
      const initialMetrics = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => ({ name: entry.name, decodedBytes: entry.decodedBodySize })))
      const initial = initialMetrics.map(entry => entry.name)
      assert.ok(!initial.some(name => /\/(?:LoremTool|TimestampTool|JsonStudio|YamlStudio|SqlStudio|RegexTool|MockApiTool|OcrTool|vendor-sql)-/.test(name)), 'Home eagerly loaded a tool/SQL bundle: ' + initial.join(', '))
      if (process.env.PERF_ALLOW_EAGER_EDITOR !== '1') assert.ok(!initial.some(name => /\/vendor-codemirror-/.test(name)), 'Home eagerly loaded the editor bundle')
      await openTool(page, tool, 'cold', cdp, round)
      rows.at(-1).homeResources = initial.map(name => basename(new URL(name).pathname))
      rows.at(-1).homeJavaScriptBytes = initialMetrics.filter(entry => /\.js$/.test(entry.name)).reduce((total, entry) => total + entry.decodedBytes, 0)
      await openTool(page, tool, 'warm', cdp, round)
      await context.close()
    }
  }
  await workerLifecycleRegression()
  if (process.env.PERF_NATIVE === '1') native = await nativeMemorySample()
  assert.deepEqual(errors, [], 'Production renderer threw during navigation')
  const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
  const summary = tools.map(([id, name]) => {
    const cold = rows.filter(row => row.id === id && row.phase === 'cold')
    const warm = rows.filter(row => row.id === id && row.phase === 'warm')
    return { id, name, coldPaintMs: Math.round(median(cold.map(row => row.paintedMs))), warmPaintMs: Math.round(median(warm.map(row => row.paintedMs))), coldResultMs: Math.round(median(cold.map(row => row.resultMs))), warmResultMs: Math.round(median(warm.map(row => row.resultMs))), coldScriptMs: Math.round(median(cold.map(row => row.ScriptDurationMs))), coldLongTaskMs: Math.round(median(cold.map(row => row.longTasks.reduce((total, task) => total + task.duration, 0)))), coldResourceKiB: Math.round(median(cold.map(row => row.resources.reduce((total, entry) => total + entry.decodedBytes, 0))) / 1024) }
  })
  console.table(summary)
  if (process.env.PERF_OUTPUT) {
    const target = resolve(process.env.PERF_OUTPUT)
    await mkdir(resolve(target, '..'), { recursive: true })
    await writeFile(target, JSON.stringify({ measuredAt: new Date().toISOString(), browser: await browser.version(), viewport: { width: 1180, height: 760 }, rounds, summary, rows, native, limitations: ['Loopback HTTP production assets; no network throttling.', 'Cold means fresh browser context and tool module graph, not cold operating-system disk cache.', 'Navigation-to-next-frame is a readiness proxy, not a user study or guaranteed real screen presentation.', 'JS heap metrics are approximate browser data, not Electron/process RAM or reclaimed memory.', 'Optional native snapshots are a hidden test window and temporary profile; short quiet samples do not establish steady-state memory or OS cache reclamation.'] }, null, 2))
  }
  console.log('PASS isolated cold/warm tool navigation; Home keeps heavy tools lazy and OCR engine/models remain unloaded')
} finally {
  await browser.close()
  await new Promise(done => server.close(done))
}
