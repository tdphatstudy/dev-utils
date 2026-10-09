import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, extname, sep, join } from 'node:path'
import assert from 'node:assert/strict'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = resolve('out/renderer')
const registry = await readFile('src/renderer/src/registry/tools.ts', 'utf8')
const expectedTools = (registry.match(/\.\.\.createToolLoader\(/g) || []).length
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname
    const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname))
    if (!path.startsWith(root + sep)) { response.writeHead(403).end(); return }
    response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' }).end(await readFile(path))
  } catch { response.writeHead(404).end() }
})
await new Promise((done) => server.listen(0, '127.0.0.1', done))
const url = 'http://127.0.0.1:' + server.address().port
const browser = await chromium.launch({ channel: process.env.UX_BROWSER_CHANNEL || undefined, headless: true })
const errors = []
const report = { scenarios: [] }

async function fixture(mode) {
  const context = await browser.newContext({ viewport: { width: 1180, height: 860 } })
  await context.addInitScript((mode) => {
    if (mode) localStorage.setItem('devutils-app', JSON.stringify({ state: { toolLoadingMode: mode }, version: 0 }))
    window.__bridgeCalls = []
    window.__workers = []
    const service = (domain, overrides = {}) => {
      const methods = new Map()
      return new Proxy(overrides, {
        get: (target, method) => {
          if (!methods.has(method)) methods.set(method, (...args) => {
            window.__bridgeCalls.push(domain + '.' + String(method))
            if (target[method]) return target[method](...args)
            if (String(method).startsWith('on')) return () => {}
            if (method === 'ensureDefault') return Promise.resolve({ id: 'fixture' })
            return Promise.resolve(null)
          })
          return methods.get(method)
        }
      })
    }
    const bridge = {
      platform: async () => 'win32',
      window: service('window', { minimize() {}, maximize() {}, close() {}, isMaximized: async () => false }),
      app: service('app', { trayAvailable: async () => true, onOpenTool: () => () => {} })
    }
    window.devutils = new Proxy(bridge, {
      get: (target, domain) => {
        if (!(domain in target)) target[domain] = service(String(domain))
        return target[domain]
      }
    })
    const OriginalWorker = window.Worker
    window.Worker = class extends OriginalWorker {
      constructor(url, options) { window.__workers.push(String(url)); super(url, options) }
    }
  }, mode)
  const page = await context.newPage()
  page.setDefaultTimeout(20000)
  page.on('pageerror', (error) => errors.push(error.message))
  const requests = []
  page.on('request', (request) => requests.push(request.url()))
  return { context, page, requests }
}

const go = async (page, id) => page.evaluate((id) => { location.hash = '/tool/' + id }, id)
const section = (page) => page.getByRole('region', { name: 'Tool loading', exact: true })
const button = (page, name) => section(page).getByRole('button', { name, exact: true })
const status = (page) => section(page).getByRole('status')
const waitHome = (page) => page.getByRole('searchbox', { name: 'Find a tool', exact: true }).waitFor()
async function assertDormant(page, baseline) {
  assert.deepEqual(await page.evaluate(() => window.__bridgeCalls), baseline)
  assert.deepEqual(await page.evaluate(() => window.__workers), [])
  assert.equal(await page.locator('[data-tool-ready]').getAttribute('data-tool-ready'), 'app.settings')
}
async function screenshot(page, name) {
  if (!process.env.BRAND_SCREENSHOT_DIR) return
  await mkdir(process.env.BRAND_SCREENSHOT_DIR, { recursive: true })
  await section(page).scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(process.env.BRAND_SCREENSHOT_DIR, name + '.png') })
}

try {
  const { context, page, requests } = await fixture()
  await page.goto(url + '/#/')
  await waitHome(page)
  await page.waitForTimeout(1200)
  assert.equal(requests.some((value) => /(?:LoremTool|TimestampTool|vendor-sql|vendor-editor|OcrTool)-/.test(value)), false)
  await go(page, 'app.settings')
  await button(page, 'On demand').waitFor()
  assert.equal(await button(page, 'On demand').getAttribute('aria-pressed'), 'true')
  await page.waitForTimeout(150) // Let Settings tray availability settle before observing tool imports.
  const baseline = await page.evaluate(() => window.__bridgeCalls)
  let release
  const gate = new Promise((done) => { release = done })
  let requested = false
  await page.route('**/assets/LoremTool-*.js', async (route) => { requested = true; await gate; await route.continue() })
  await button(page, 'On demand').focus()
  await page.keyboard.press('ArrowRight')
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('devutils-app')).state.toolLoadingMode === 'preload')
  await page.waitForFunction(() => document.querySelector('[aria-labelledby="tool-loading-heading"] [role="status"]')?.textContent?.includes('Preparing tool interfaces'))
  for (let tries = 0; tries < 100 && !requested; tries++) await page.waitForTimeout(20)
  assert.equal(requested, true)
  assert.equal(await button(page, 'Preload').evaluate((node) => node === document.activeElement), true)
  await page.keyboard.press('ArrowLeft')
  assert.equal(await button(page, 'On demand').getAttribute('aria-pressed'), 'true')
  release()
  await page.waitForTimeout(550)
  assert.equal(requests.some((value) => /TimestampTool-/.test(value)), false)
  await assertDormant(page, baseline)
  await page.unroute('**/assets/LoremTool-*.js')
  report.scenarios.push('default demand loading, accessible mode selection, cancellation during an in-flight import')
  console.log('PASS default On demand and cancellation without mounting tools')

  // Simulate a visibility event deterministically; this is not a native tray test.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await button(page, 'Preload').click()
  await page.getByText(/Preparation paused/).waitFor()
  await page.waitForTimeout(350)
  assert.equal(requests.some((value) => /TimestampTool-/.test(value)), false)
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expectReady()
  async function expectReady() {
    await page.waitForFunction(() => /\d+ tool interfaces prepared\.$/.test(document.querySelector('[aria-labelledby="tool-loading-heading"] [role="status"]')?.textContent || ''), null, { timeout: 60000 })
  }
  const text = await status(page).textContent()
  const total = Number(text.match(/^(\d+)/)[1])
  assert.equal(total, expectedTools)
  await assertDormant(page, baseline)
  assert.equal(requests.some((value) => /(?:tesseract|traineddata|pdf\.worker|ocr-engine)/i.test(value)), false)
  assert.equal(requests.some((value) => !value.startsWith(url)), false)
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('devutils-app')).state)
  assert.equal(saved.toolLoadingMode, 'preload')
  assert.equal(Object.hasOwn(saved, 'progress'), false)
  assert.equal(Object.hasOwn(saved, 'drafts'), false)
  await screenshot(page, 'tool-loading-preload-dark-1180')
  await page.setViewportSize({ width: 720, height: 650 })
  await page.getByRole('button', { name: 'Switch to light theme', exact: true }).click()
  await screenshot(page, 'tool-loading-preload-light-720')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  report.scenarios.push(`visibility pause/resume, all ${total} interfaces prepared, no tool effects/workers/processing, metadata-only persistence`)
  console.log(`PASS ${total} interfaces prepared without privileged actions or processing workers`)

  const before = requests.filter((value) => /(?:SqlStudio|vendor-sql)-/.test(value)).length
  await go(page, 'sql.studio')
  await page.locator('[data-tool-ready="sql.studio"]').waitFor()
  await page.locator('.cm-content[aria-label="MySQL input"]').waitFor()
  assert.equal(requests.filter((value) => /(?:SqlStudio|vendor-sql)-/.test(value)).length, before)
  await go(page, 'app.settings')
  await button(page, 'On demand').click()
  assert.equal(await status(page).count(), 0)
  await button(page, 'Preload').click()
  await expectReady()
  await go(page, 'text.lorem')
  await page.locator('[data-tool-ready="text.lorem"]').waitFor()
  await page.locator('#lorem-output').waitFor()
  await go(page, 'app.settings')
  await page.reload()
  await expectReady()
  assert.equal(await button(page, 'Preload').getAttribute('aria-pressed'), 'true')
  assert.deepEqual(await page.evaluate(() => window.__workers), [])
  report.scenarios.push('cached first render, toggling back reuses imports, persisted preload after reload')
  console.log('PASS cached tools open and Preload survives reload')
  await context.close()

  const broken = await fixture('preload')
  await broken.page.route('**/assets/SqlStudio-*.js', (route) => route.abort('failed'))
  await broken.page.goto(url + '/#/tool/app.settings')
  await broken.page.getByText(/could not be prepared/).waitFor({ timeout: 60000 })
  assert.match(await status(broken.page).textContent(), new RegExp(`${expectedTools - 1} of ${expectedTools}.*1 could not`))
  await go(broken.page, 'text.lorem')
  await broken.page.locator('#lorem-output').waitFor()
  await go(broken.page, 'app.settings')
  await button(broken.page, 'On demand').click()
  assert.equal(await button(broken.page, 'On demand').getAttribute('aria-pressed'), 'true')
  assert.deepEqual(await broken.page.evaluate(() => window.__workers), [])
  report.scenarios.push('failed chunk contained, partial progress truthful, remaining tools and Settings usable')
  console.log('PASS preload failure contained without blocking remaining tools')
  await broken.context.close()
  assert.deepEqual(errors, [])
  if (process.env.BRAND_SCREENSHOT_DIR) {
    await writeFile(join(process.env.BRAND_SCREENSHOT_DIR, 'tool-loading-mode-report.json'), JSON.stringify(report, null, 2))
  }
} finally {
  await browser.close()
  await new Promise((done) => server.close(done))
}
