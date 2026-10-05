import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve, extname, sep, join } from 'node:path'
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = resolve('out/renderer')
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }
const server = createServer(async (req, res) => {
  try {
    const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname)
    if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return }
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' }); res.end(await readFile(path))
  } catch { res.writeHead(404).end() }
})
const browser = await chromium.launch({ channel: process.env.UX_BROWSER_CHANNEL || undefined, headless: true })
await new Promise(ok => server.listen(0, '127.0.0.1', ok))
const url = `http://127.0.0.1:${server.address().port}/index.html`
const page = await browser.newPage({ viewport: { width: 1100, height: 820 } })
page.setDefaultTimeout(12000)
const errors = [], requests = []
page.on('pageerror', error => errors.push(error.message)); page.on('request', request => requests.push(request.url()))
await page.addInitScript(() => {
  const state = window.__mock = { running: false, yaml: null, starts: 0, copied: '', failStart: false, holdPoll: false, pending: null }
  const status = () => ({ running: state.running, port: state.running ? 4010 : null, baseUrl: state.running ? 'http://127.0.0.1:4010' : null, name: state.running ? 'Fixture API' : null, startedAt: null, requests: 0, logs: [] })
  window.devutils = {
    platform: async () => 'win32', app: { trayAvailable: async () => true, onOpenTool: () => () => {} },
    window: { minimize() {}, maximize() {}, close() {} }, privateBox: { ensureDefault: async () => ({ id: 'fixture' }) },
    mockApi: {
      status: async () => { const snapshot = status(); if (state.holdPoll) return new Promise(ok => { state.pending = () => ok(snapshot) }); return snapshot },
      getConfig: async () => state.yaml,
      start: async yaml => { state.starts++; if (state.failStart) throw new Error('Port 4010 is already in use. Choose a different port.'); state.yaml = yaml; state.running = true; return status() },
      stop: async () => { state.running = false; state.yaml = null; return status() }, clearLogs: async () => status()
    }
  }
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { state.copied = text } } })
})
const view = async name => { await page.getByRole('tab', { name, exact: true }).click() }
const match = async expected => {
  await page.getByRole('button', { name: 'Match response', exact: true }).click()
  await page.getByRole('status').filter({ hasText: expected }).waitFor()
}
try {
  await page.goto(url + '#/tool/network.mock-api')
  await page.getByRole('button', { name: 'Start server', exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Start server', exact: true }).isEnabled(), true)
  await page.getByText('Server settings', { exact: true }).click()
  await page.getByLabel('Port', { exact: true }).fill('4011')
  await page.getByRole('button', { name: 'Apply server settings', exact: true }).click()
  await page.getByText(/port 4011 · CORS enabled/).waitFor()
  await page.getByText('Server settings', { exact: true }).click()
  await page.getByLabel('Port', { exact: true }).fill('4010')
  await page.getByRole('button', { name: 'Apply server settings', exact: true }).click()
  await view('Try rules'); await match('Rule: Filter admins')
  await page.getByLabel('Request headers (JSON object)').fill('{}'); await match('Status: 401')
  await page.getByLabel('Request headers (JSON object)').fill('{"Authorization":"Bearer sample"}')
  await page.getByLabel('Request path + query').fill('/api/users?page=4'); await match('Rule: No users after page 3')
  await page.getByRole('tabpanel').getByLabel('Method', { exact: true }).selectOption('HEAD'); await match('(No response body)')
  await page.getByLabel('Request path + query').fill('/api/users?role=%ZZ')
  await page.getByRole('button', { name: 'Match response', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: /encoding/i }).waitFor()
  await page.getByRole('tabpanel').getByLabel('Method', { exact: true }).selectOption('POST')
  await page.getByLabel('Request path + query').fill('/api/users')
  await page.getByLabel('Request body (JSON, optional)').fill('{}'); await match('Status: 422')
  await page.getByLabel('Request body (JSON, optional)').fill('{"name":"New sample"}'); await match('Status: 201')
  await page.getByLabel('Request body (JSON, optional)').fill('{"constructor":"bad"}')
  await page.getByRole('button', { name: 'Match response', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'bounded JSON' }).waitFor()
  assert.ok(requests.every(request => request.startsWith(`http://127.0.0.1:${server.address().port}/`)), 'Rule testing sent external/API traffic')
  console.log('PASS ordered header/filter/body/HEAD rules and malformed requests are simulated locally')

  await view('Endpoints'); await page.getByRole('button', { name: 'Add endpoint', exact: true }).click()
  const endpointDialog = page.getByRole('dialog', { name: 'Endpoint', exact: true })
  await endpointDialog.getByLabel('Endpoint name').fill('Health check')
  await endpointDialog.getByLabel('Path').fill('/api/health')
  await endpointDialog.getByRole('button', { name: 'Save endpoint', exact: true }).click()
  await page.getByRole('button', { name: 'Edit response Default', exact: true }).click()
  const responseDialog = page.getByRole('dialog', { name: 'Response rule', exact: true })
  await responseDialog.getByLabel('Status code').fill('700')
  await responseDialog.getByRole('button', { name: 'Save response', exact: true }).click()
  assert.equal(await responseDialog.getByLabel('Status code').evaluate(input => input.checkValidity()), false)
  assert.equal(await responseDialog.isVisible(), true, 'Invalid status closed the editor')
  await responseDialog.getByLabel('Status code').fill('200')
  await responseDialog.getByLabel('Response headers', { exact: true }).fill('{"Set-Cookie":"unsafe=1"}')
  await responseDialog.getByRole('button', { name: 'Save response', exact: true }).click()
  await responseDialog.getByRole('alert').filter({ hasText: /reserved|managed|forbidden|supported/i }).waitFor()
  await responseDialog.getByLabel('Response headers', { exact: true }).fill('{"X-Fixture":"health"}')
  await responseDialog.getByLabel('Body format').selectOption('text')
  await responseDialog.getByRole('textbox', { name: 'Response body', exact: true }).fill('healthy <script>literal</script>')
  await responseDialog.getByRole('button', { name: 'Save response', exact: true }).click()
  await page.getByText('healthy <script>literal</script>', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Add response', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Save response', exact: true }).click()
  await view('Try rules'); await page.getByRole('tabpanel').getByLabel('Method', { exact: true }).selectOption('GET')
  await page.getByLabel('Request path + query').fill('/api/health')
  await page.getByLabel('Request headers (JSON object)').fill('{"x-scenario":"error"}')
  await page.getByLabel('Request body (JSON, optional)').fill(''); await match('Status: 500')
  await page.getByLabel('Request headers (JSON object)').fill('{}'); await match('healthy <script>literal</script>')
  console.log('PASS endpoint/response authoring, invalid status/header refusal, text safety and conditional fallback')

  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export YAML', exact: true }).click()
  const file = await downloaded
  assert.equal(file.suggestedFilename(), 'mock-api.yaml')
  const contents = await readFile(await file.path(), 'utf8')
  assert.match(contents, /path: \/api\/health/)
  await page.getByLabel('Import Mock API YAML').setInputFiles({ name: 'broken.yaml', mimeType: 'text/yaml', buffer: Buffer.from('version: 1\nversion: 2\n') })
  await page.getByRole('alert').filter({ hasText: /YAML|unique/i }).waitFor()
  await page.getByRole('button', { name: 'Copy YAML', exact: true }).click()
  assert.equal(await page.evaluate(() => window.__mock.copied), contents, 'Invalid import replaced the draft')
  await page.getByLabel('Import Mock API YAML').setInputFiles({ name: 'invalid-utf8.yaml', mimeType: 'text/yaml', buffer: Buffer.concat([Buffer.from(contents + '\n# '), Buffer.from([0xc3, 0x28])]) })
  await page.getByRole('alert').filter({ hasText: 'valid UTF-8 encoding' }).waitFor()
  await page.getByLabel('Import Mock API YAML').setInputFiles({ name: 'restored.yaml', mimeType: 'text/yaml', buffer: Buffer.from(contents) })
  await page.getByRole('tabpanel', { name: 'Endpoints', exact: true }).waitFor()
  assert.equal(await page.evaluate(() => window.__mock.starts), 0, 'Import started a listener')
  await page.evaluate(() => { window.__mock.failStart = true })
  await page.getByRole('button', { name: 'Start server', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'already in use' }).waitFor()
  await page.evaluate(() => { window.__mock.failStart = false })
  await page.getByRole('button', { name: 'Start server', exact: true }).click()
  await page.getByRole('button', { name: 'Stop server', exact: true }).waitFor()
  await page.evaluate(() => { window.__mock.holdPoll = true })
  await page.waitForFunction(() => window.__mock.pending)
  await page.getByRole('button', { name: 'Stop server', exact: true }).click()
  await page.getByRole('button', { name: 'Start server', exact: true }).waitFor()
  await page.evaluate(() => { window.__mock.holdPoll = false; window.__mock.pending(); window.__mock.pending = null })
  assert.equal(await page.getByRole('button', { name: 'Start server', exact: true }).isVisible(), true)
  console.log('PASS YAML round-trip/invalid import preserves draft, port errors and stale poll cannot undo Stop')

  await page.setViewportSize({ width: 720, height: 600 })
  for (const tab of ['Endpoints', 'YAML', 'Try rules', 'Activity', 'Guide']) {
    await view(tab)
    const size = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }))
    assert.ok(size.content <= size.width, `${tab} overflows at minimum window width`)
  }
  const preview = await browser.newPage()
  await preview.goto(url + '#/tool/network.mock-api')
  await preview.getByRole('alert').filter({ hasText: 'requires the DevFusion desktop app' }).waitFor()
  assert.equal(await preview.getByRole('button', { name: 'Start server', exact: true }).isDisabled(), true)
  await preview.close()
  if (process.env.BRAND_SCREENSHOT_DIR) {
    await page.setViewportSize({ width: 1100, height: 820 }); await view('Endpoints')
    await mkdir(process.env.BRAND_SCREENSHOT_DIR, { recursive: true })
    await page.screenshot({ path: join(process.env.BRAND_SCREENSHOT_DIR, 'devfusion-mock-api.png'), animations: 'disabled' })
  }
  assert.deepEqual(errors, [])
  console.log('PASS all Mock API views at720px, browser capability state and no renderer errors')
} finally {
  const closed = new Promise(ok => server.close(ok)); server.closeAllConnections(); await browser.close(); await closed
}
