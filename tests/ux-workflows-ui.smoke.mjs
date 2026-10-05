import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve, extname, sep, join } from 'node:path'
import assert from 'node:assert/strict'

// Production-renderer UX checks with a RAM-only bridge fixture. No actual HTTP,
// screen capture, clipboard or vault operation is performed.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = resolve('out/renderer')
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }
const server = createServer(async (req, res) => {
  try {
    const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname)
    if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return }
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' })
    res.end(await readFile(path))
  } catch { res.writeHead(404).end() }
})
const browser = await chromium.launch({ channel: process.env.UX_BROWSER_CHANNEL || undefined, headless: true })
await new Promise(ok => server.listen(0, '127.0.0.1', ok))
const url = `http://127.0.0.1:${server.address().port}/index.html`
const page = await browser.newPage({ viewport: { width: 1100, height: 820 } })
page.setDefaultTimeout(12000)
const errors = [], network = []
page.on('pageerror', error => errors.push(error.message))
page.on('request', request => network.push(request.url()))
await page.addInitScript(() => {
  localStorage.setItem('devutils-app', JSON.stringify({ state: { theme: 'dark', sidebarCollapsed: true, recentToolIds: [], launchMode: 'home' }, version: 0 }))
  const state = window.__workflows = { copied: '', http: [], mockStarts: 0, ocr: [], color: null, holdHttp: false, pending: null, cancellations: 0 }
  const stopped = () => ({ running: false, port: null, baseUrl: null, name: null, startedAt: null, requests: 0, logs: [] })
  const response = payload => ({ status: 200, statusText: 'OK', ok: true, timeMs: 12, size: 19, headers: { 'content-type': 'application/json' }, bodyText: '{"hello":"fixture"}', bodyEncoding: 'utf8', finalUrl: payload.url })
  window.devutils = {
    platform: async () => 'win32', version: async () => '0.1.0',
    app: { trayAvailable: async () => true, quit: async () => {}, onOpenTool: () => () => {} },
    window: { minimize() {}, maximize() {}, close() {} }, privateBox: { ensureDefault: async () => ({ id: 'fixture' }) },
    mockApi: { status: async () => stopped(), getConfig: async () => null, start: async () => { state.mockStarts++; return stopped() }, stop: async () => stopped(), clearLogs: async () => stopped() },
    net: {
      httpRequest: async payload => { state.http.push(payload); if (state.holdHttp) return new Promise(ok => { state.pending = () => ok(response(payload)) }); return response(payload) },
      cancelHttpRequest: async () => { state.cancellations++; state.pending?.(); state.pending = null }
    },
    ocr: { recognize: async input => { state.ocr.push(input); return { text: 'Fixture text', pages: 1, ocrPages: 1, confidence: 97 } }, capture: async input => { state.ocr.push(input); return { text: 'Screen fixture', pages: 1, ocrPages: 1, confidence: 97 } }, cancel: async () => true, onProgress: () => () => {} },
    color: { lastScreen: async () => null, pickScreen: async () => ({ hex: '#112233' }), onPicked: callback => { state.color = callback; return () => { state.color = null } } }
  }
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { state.copied = text } } })
})

const tab = name => page.getByRole('tab', { name, exact: true })
const copyYaml = async () => { await page.getByRole('button', { name: 'Copy YAML', exact: true }).click(); return page.evaluate(() => window.__workflows.copied) }
const open = async id => { await page.goto(url + '#/tool/' + id); await page.getByRole('heading', { level: 1 }).waitFor() }
const screenshot = async name => {
  if (!process.env.BRAND_SCREENSHOT_DIR) return
  await mkdir(process.env.BRAND_SCREENSHOT_DIR, { recursive: true })
  await page.screenshot({ path: join(process.env.BRAND_SCREENSHOT_DIR, name), animations: 'disabled' })
}
try {
  await open('network.mock-api')
  await page.getByRole('button', { name: 'Start server', exact: true }).waitFor()
  const original = await copyYaml()
  await page.getByRole('button', { name: 'Delete response Missing Authorization', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: 'Edit response Missing Authorization', exact: true }).count(), 0)
  await page.getByRole('button', { name: 'Undo delete', exact: true }).click()
  assert.equal(await copyYaml(), original, 'Undo must preserve YAML text, comments, order and selected endpoint')
  await page.getByRole('button', { name: /POST.*\/api\/users.*Create user/ }).click()
  await page.getByRole('button', { name: 'Delete endpoint', exact: true }).click()
  await page.getByRole('button', { name: 'Undo delete', exact: true }).click()
  await page.getByRole('heading', { name: 'Create user', exact: true }).waitFor()
  assert.equal(await copyYaml(), original)
  await page.getByRole('button', { name: 'Delete response Missing name', exact: true }).click()
  await page.getByRole('button', { name: 'Edit endpoint', exact: true }).click()
  await page.getByRole('dialog', { name: 'Endpoint', exact: true }).getByLabel('Endpoint name').fill('Create user updated')
  await page.getByRole('button', { name: 'Save endpoint', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: 'Undo delete', exact: true }).count(), 0, 'An old Undo must not overwrite later edits')
  await tab('Endpoints').focus(); await page.keyboard.press('ArrowRight')
  assert.equal(await tab('YAML').getAttribute('aria-selected'), 'true')
  const panelId = await tab('YAML').getAttribute('aria-controls')
  assert.equal(await page.locator('#' + panelId).getAttribute('aria-labelledby'), await tab('YAML').getAttribute('id'))
  await page.keyboard.press('End'); assert.equal(await tab('Guide').getAttribute('aria-selected'), 'true')
  await page.keyboard.press('Home'); assert.equal(await tab('Endpoints').getAttribute('aria-selected'), 'true')
  assert.equal(await page.evaluate(() => window.__workflows.mockStarts), 0, 'Editing or Undo unexpectedly started a server')
  console.log('PASS Mock API Undo preserves exact YAML and selected endpoint, later edits clear Undo; linked tabs support arrows/Home/End')

  await open('network.http')
  await page.getByLabel('HTTP method').waitFor()
  await page.getByLabel('HTTP method').selectOption('POST')
  const requestTabs = page.getByRole('tablist', { name: 'HTTP request sections', exact: true })
  assert.equal(await requestTabs.getByRole('tab', { name: 'Body', exact: true }).getAttribute('aria-selected'), 'true')
  await page.getByLabel('HTTP method').selectOption('GET')
  assert.equal(await requestTabs.getByRole('tab', { name: 'Params', exact: true }).getAttribute('aria-selected'), 'true')
  await requestTabs.getByRole('tab', { name: 'Params', exact: true }).focus(); await page.keyboard.press('End')
  assert.equal(await requestTabs.getByRole('tab', { name: 'Headers', exact: true }).getAttribute('aria-selected'), 'true', 'Keyboard selected disabled Body tab')
  await page.keyboard.press('ArrowRight')
  assert.equal(await requestTabs.getByRole('tab', { name: 'Params', exact: true }).getAttribute('aria-selected'), 'true')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await page.getByRole('textbox', { name: 'HTTP response body', exact: true }).waitFor()
  assert.equal(await page.evaluate(() => window.__workflows.http.length), 1)
  const responseTabs = page.getByRole('tablist', { name: 'HTTP response sections', exact: true })
  await responseTabs.getByRole('tab', { name: 'Response', exact: true }).focus(); await page.keyboard.press('End')
  await page.getByRole('textbox', { name: 'HTTP code snippet', exact: true }).waitFor()
  assert.equal(await responseTabs.getByRole('tab', { name: 'Code', exact: true }).getAttribute('aria-selected'), 'true')
  await page.evaluate(() => { window.__workflows.holdHttp = true })
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Canceled' }).waitFor()
  assert.equal(await page.evaluate(() => window.__workflows.cancellations), 1)
  console.log('PASS HTTP POST→GET recovers Params, arrows skip disabled tabs; Send/response/code and cancellation remain usable')

  await open('design.color')
  await page.getByLabel('HEX color', { exact: true }).fill('#ABC')
  await page.getByLabel('HEX color', { exact: true }).blur()
  await page.getByRole('button', { name: 'Use #AABBCC', exact: true }).waitFor()
  assert.match(await page.getByRole('button', { name: 'Use #AABBCC', exact: true }).innerText(), /#AABBCC/, 'Recent color needs a text label as well as a swatch')
  await page.getByRole('button', { name: 'Copy RGB', exact: true }).click()
  assert.equal(await page.evaluate(() => window.__workflows.copied), 'rgb(170, 187, 204)')
  await page.getByRole('button', { name: 'Pick screen color', exact: true }).click()
  await page.getByRole('status').filter({ hasText: '#112233 selected' }).waitFor()
  console.log('PASS Color Picker retains conversions/OS result and recent colors are readable beyond hue alone')

  const screens = [
    ['network.mock-api', 'Start server'], ['network.http', 'Send'], ['design.color', 'Pick screen color'], ['text.ocr', 'Extract file text']
  ]
  await page.setViewportSize({ width: 720, height: 500 })
  for (const [id, action] of screens) {
    await open(id); await page.getByRole('button', { name: action, exact: true }).waitFor()
    for (const dark of [true, false]) {
      await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark)
      const size = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth, height: innerHeight, docHeight: document.documentElement.scrollHeight }))
      assert.ok(size.content <= size.width, `${id} overflows horizontally at 720×500`)
      assert.ok(size.docHeight <= size.height, `${id} overflows the desktop shell vertically at 720×500`)
      await screenshot(`devfusion-ux-${id.replace('.', '-')}-${dark ? 'dark' : 'light'}-720.png`)
    }
  }
  assert.ok(network.every(request => request.startsWith(`http://127.0.0.1:${server.address().port}/`)), 'Fixture sent external traffic')
  assert.deepEqual(errors, [])
  console.log('PASS Mock/HTTP/Color/OCR at720×500 in light/dark; no renderer errors or external requests')
} finally {
  const closed = new Promise(ok => server.close(ok)); server.closeAllConnections(); await browser.close(); await closed
}
