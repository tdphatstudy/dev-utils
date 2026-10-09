import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import assert from 'node:assert/strict'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = resolve('out/renderer')
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer(async (request, response) => {
  try {
    const path = resolve(root, '.' + new URL(request.url, 'http://localhost').pathname)
    if (!path.startsWith(root + sep)) { response.writeHead(403).end(); return }
    response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' })
    response.end(await readFile(path))
  } catch { response.writeHead(404).end() }
})
const browser = await chromium.launch({ channel: process.env.UX_BROWSER_CHANNEL || undefined, headless: true })
await new Promise(done => server.listen(0, '127.0.0.1', done))
const page = await browser.newPage({ viewport: { width: 1180, height: 760 } })
page.setDefaultTimeout(12000)
await page.addInitScript(() => {
  window.devutils = {
    platform: async () => 'win32', window: { minimize() {}, maximize() {}, close() {}, isMaximized: async () => false },
    app: { trayAvailable: async () => true, onOpenTool: () => () => {} }, privateBox: { ensureDefault: async () => ({ id: 'fixture' }) }
  }
  const state = window.__sqlFixture = { jobs: [], workers: [], hold: false, ticks: 0 }
  setInterval(() => { state.ticks++ }, 20)
  const NativeWorker = window.Worker
  window.Worker = class {
    constructor(url, options) {
      this.worker = new NativeWorker(url, options)
      this.event = { startedAt: performance.now(), terminated: false }
      state.workers.push(this.event)
    }
    set onmessage(callback) { this.worker.onmessage = callback; this.callback = callback }
    get onmessage() { return this.callback }
    set onerror(callback) { this.worker.onerror = callback }
    postMessage(job) { state.jobs.push({ kind: job.kind, input: job.input, at: performance.now() }); if (!state.hold) this.worker.postMessage(job) }
    terminate() { this.event.terminated = true; this.worker.terminate() }
  }
})
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html#/tool/sql.studio`)
  const editor = page.getByRole('textbox', { name: 'MySQL input', exact: true })
  const format = page.getByRole('button', { name: 'Format', exact: true })
  await format.waitFor()
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(button => button.textContent === 'Format').disabled)
  assert.equal(await page.evaluate(() => window.__sqlFixture.jobs.some(job => job.kind === 'format')), false)
  const beforeOptions = await page.evaluate(() => window.__sqlFixture.jobs.length)
  await page.getByLabel('Indent').selectOption('4')
  await page.getByLabel('Uppercase keywords').uncheck()
  await page.waitForTimeout(300)
  assert.equal(await page.evaluate(() => window.__sqlFixture.jobs.length), beforeOptions, 'Formatting options started automatic processing')
  await editor.fill('select id from users where active=1')
  await page.waitForTimeout(50)
  await editor.fill('select name from users where active=2')
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(button => button.textContent === 'Format').disabled)
  const editJobs = await page.evaluate(() => window.__sqlFixture.jobs.slice(-1))
  assert.equal(editJobs[0].input, 'select name from users where active=2', 'Obsolete input published a validation result')
  await format.click()
  await page.waitForFunction(() => window.__sqlFixture.jobs.some(job => job.kind === 'format'))
  await page.waitForFunction(() => document.querySelector('.cm-content').textContent.includes('active = 2'))
  const beforeLarge = await page.evaluate(() => ({ ticks: window.__sqlFixture.ticks, at: performance.now() }))
  await page.getByLabel('Open text file', { exact: true }).setInputFiles({ name: 'large.sql', mimeType: 'text/plain', buffer: Buffer.from('SELECT id FROM users WHERE active = 1;\n'.repeat(20_000)) })
  await page.getByRole('status').filter({ hasText: 'SQL input exceeds 1,000 statements' }).first().waitFor()
  const afterLarge = await page.evaluate(() => ({ ticks: window.__sqlFixture.ticks, at: performance.now() }))
  assert.ok(afterLarge.at - beforeLarge.at < 5500, 'Large SQL exceeded the bounded processing deadline')
  assert.ok(afterLarge.ticks - beforeLarge.ticks >= 3, 'Renderer event loop did not respond during SQL processing')
  await page.evaluate(() => { window.__sqlFixture.hold = true })
  await editor.fill('SELECT 8')
  await page.waitForFunction(() => window.__sqlFixture.jobs.at(-1)?.input === 'SELECT 8')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.equal(await page.evaluate(() => window.__sqlFixture.workers.every(worker => worker.terminated)), true)
  await page.getByRole('status').filter({ hasText: 'SQL processing canceled' }).first().waitFor()
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await page.waitForFunction(() => window.__sqlFixture.workers.at(-1)?.terminated === false)
  await page.evaluate(() => { location.hash = '#/' })
  await page.getByRole('heading', { name: 'DevFusion', exact: true }).waitFor()
  assert.equal(await page.evaluate(() => window.__sqlFixture.workers.every(worker => worker.terminated)), true, 'Navigation retained a SQL worker')
  console.log('PASS real SQL workers, edit debounce, manual formatting, 780 KB bounded input, responsive renderer, cancellation and navigation cleanup')
} finally {
  server.closeAllConnections()
  await browser.close()
  await new Promise(done => server.close(done))
}
