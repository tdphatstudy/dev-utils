import { workspaceField, workspaceValue } from './tool-workspace.fixture.mjs'
import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve, extname, sep, join } from 'node:path'
import assert from 'node:assert/strict'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = resolve('out/renderer')
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname
    const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname))
    if (!path.startsWith(root + sep)) { response.writeHead(403).end(); return }
    response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' }).end(await readFile(path))
  } catch { response.writeHead(404).end() }
})
await new Promise(done => server.listen(0, '127.0.0.1', done))
const url = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ channel: process.env.UX_BROWSER_CHANNEL || undefined, headless: true })
const page = await browser.newPage({ viewport: { width: 1180, height: 760 } })
const errors = [], external = []
page.on('pageerror', error => errors.push(error.message))
await page.route('**/*', route => {
  if (new URL(route.request().url()).origin === url) return route.continue()
  external.push(route.request().url()); return route.abort()
})
const open = async id => { await page.goto(`${url}/#/tool/${id}`); await page.locator(`[data-tool-ready="${id}"]`).waitFor() }
const result = title => page.getByRole('region', { name: title, exact: true })
const run = async (action, title) => { await page.getByRole('button', { name: action, exact: true }).click(); await result(title).waitFor() }
const copy = async () => {
  await page.evaluate(() => { window.fixtureCopy = ''; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.fixtureCopy = text } } }) })
  await page.getByRole('button', { name: 'Copy report', exact: true }).click()
  return page.evaluate(() => window.fixtureCopy)
}
try {
  const tools = [['json.schema', 'Validate payload', 'Validation results'], ['network.openapi', 'Review API contract', 'Contract findings'], ['json.reconcile', 'Reconcile records', 'Reconciliation results'], ['text.logs', 'Analyze logs', 'Log analysis']]
  for (const theme of ['light', 'dark']) {
    await page.goto(url)
    await page.evaluate(theme => localStorage.setItem('devutils-app', JSON.stringify({ state: { theme }, version: 0 })), theme)
    for (const [width, height] of [[1180, 760], [720, 500]]) {
      await page.setViewportSize({ width, height })
      for (const [id, action, title] of tools) {
        await open(id)
        await page.getByRole('button', { name: 'Load example', exact: true }).click()
        if (id === 'json.schema') {
          assert.equal(await page.getByRole('textbox', { name: 'JSON Schema', exact: true }).isVisible(), true)
          assert.equal(await page.getByRole('textbox', { name: 'Payload JSON', exact: true }).isVisible(), false)
          await page.getByRole('tab', { name: 'Payload JSON', exact: true }).click()
          assert.equal(await page.getByRole('textbox', { name: 'JSON Schema', exact: true }).isVisible(), false)
          assert.match(await workspaceValue(page, 'Payload JSON'), /sample-order/)
        }
        await run(action, title)
        if (width === 720) {
          assert.equal(await page.getByRole('tab', { name: 'Results', exact: true }).getAttribute('aria-selected'), 'true')
          assert.equal(await page.getByRole('tabpanel', { name: 'Input', exact: true }).isVisible(), false)
        }
        assert.equal(await page.locator('#workspace').evaluate(element => element.scrollWidth <= element.clientWidth), true, `${id} overflow ${width}`)
        if (process.env.BRAND_SCREENSHOT_DIR) {
          await mkdir(process.env.BRAND_SCREENSHOT_DIR, { recursive: true })
          await page.screenshot({ path: join(process.env.BRAND_SCREENSHOT_DIR, `advanced-${id}-${theme}-${width}.png`), animations: 'disabled' })
        }
      }
    }
  }
  console.log('PASS 4 advanced tools, real production workers, light/dark 1180x760 and 720x500, no workspace overflow')
  await page.setViewportSize({ width: 1180, height: 760 })
  await open('json.schema')
  await (await workspaceField(page, 'JSON Schema', { exact: true })).fill('{"type":"object","properties":{"token":{"const":"private-expected"}},"required":["token"]}')
  await (await workspaceField(page, 'Payload JSON', { exact: true })).fill('{"token":"private-actual"}')
  await run('Validate payload', 'Validation results')
  assert.match(await result('Validation results').innerText(), /invalid/)
  assert.doesNotMatch(await copy(), /private-/)
  await (await workspaceField(page, 'Payload JSON', { exact: true })).fill('{"token":"private-expected"}')
  assert.equal(await result('Validation results').count(), 0)
  await run('Validate payload', 'Validation results')
  assert.match(await result('Validation results').innerText(), /Payload is valid/)
  await (await workspaceField(page, 'JSON Schema', { exact: true })).fill('{"$ref":"https://example.test/private-ref"}')
  await page.getByRole('button', { name: 'Validate payload', exact: true }).click()
  await page.getByRole('alert').waitFor()
  assert.equal(await result('Validation results').count(), 0)
  await (await workspaceField(page, 'Open JSON Schema file', { exact: true })).setInputFiles({ name: 'schema.json', mimeType: 'application/json', buffer: Buffer.from('{"type":"integer"}') })
  await page.waitForFunction(() => document.querySelector('.cm-content[aria-label="JSON Schema"]').textContent === '{"type":"integer"}')
  await (await workspaceField(page, 'Payload JSON', { exact: true })).fill('1')
  await run('Validate payload', 'Validation results')
  assert.match(await result('Validation results').innerText(), /Payload is valid/)
  await (await workspaceField(page, 'JSON Schema', { exact: true })).fill('{"required":["constructor"]}')
  await (await workspaceField(page, 'Payload JSON', { exact: true })).fill('{}')
  await run('Validate payload', 'Validation results')
  assert.match(await result('Validation results').innerText(), /payload is invalid/)
  // A pathological user regex runs outside the UI. Cancellation and timeout terminate the worker.
  await (await workspaceField(page, 'JSON Schema', { exact: true })).fill('{"type":"string","pattern":"^(a+)+$"}')
  await (await workspaceField(page, 'Payload JSON', { exact: true })).fill(JSON.stringify('a'.repeat(40) + '!'))
  await page.getByRole('button', { name: 'Validate payload', exact: true }).click()
  await page.getByRole('button', { name: 'Cancel analysis', exact: true }).click()
  assert.match(await page.getByRole('alert').innerText(), /cancelled/)
  await page.getByRole('button', { name: 'Validate payload', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'exceeded 5 seconds' }).waitFor({ timeout: 10000 })
  await page.getByRole('button', { name: 'Load example', exact: true }).click()
  await run('Validate payload', 'Validation results')
  await page.evaluate(() => { window.fixtureFileRead = File.prototype.arrayBuffer; File.prototype.arrayBuffer = function () { return new Promise(resolve => { window.fixtureFileResolve = resolve }) } })
  await (await workspaceField(page, 'Open JSON Schema file', { exact: true })).setInputFiles({ name: 'late.json', mimeType: 'application/json', buffer: Buffer.from('{"type":"boolean"}') })
  await page.getByRole('button', { name: 'Clear inputs', exact: true }).click()
  await page.evaluate(() => { window.fixtureFileResolve(new TextEncoder().encode('{"type":"boolean"}').buffer); File.prototype.arrayBuffer = window.fixtureFileRead })
  await page.waitForTimeout(100)
  assert.equal(await workspaceValue(page, 'JSON Schema'), '')
  console.log('PASS schema local refs, redacted errors/report, invalidation, UTF-8 file import, responsive Cancel, worker timeout and retry')
  await open('network.openapi')
  await page.getByRole('button', { name: 'Load example', exact: true }).click()
  await run('Review API contract', 'Contract findings')
  assert.match(await result('Contract findings').getByRole('status').innerText(), /2 breaking/)
  await (await workspaceField(page, 'Show findings')).selectOption('breaking')
  assert.equal(await result('Contract findings').locator('tbody tr').count(), 2)
  await (await workspaceField(page, 'Target OpenAPI (optional)', { exact: true })).fill('')
  await run('Review API contract', 'Contract findings')
  assert.match(await result('Contract findings').getByRole('status').innerText(), /2 operations/)
  await open('json.reconcile')
  await page.getByRole('button', { name: 'Load example', exact: true }).click()
  await run('Reconcile records', 'Reconciliation results')
  assert.match(await result('Reconciliation results').innerText(), /1 changed · 1 missing · 0 extra · 2 ambiguous rows · 1 same/)
  assert.doesNotMatch(await copy(), /sample-before|sample-after|"balance":|"id":/)
  await (await workspaceField(page, 'Show records')).selectOption('duplicate')
  assert.equal(await result('Reconciliation results').locator('tbody tr').count(), 2)
  await (await workspaceField(page, 'Target records', { exact: true })).fill('[{"id":"private-key","secret":"private-row"}]')
  assert.equal(await result('Reconciliation results').count(), 0)
  await open('text.logs')
  await page.getByRole('button', { name: 'Load example', exact: true }).click()
  await run('Analyze logs', 'Log analysis')
  assert.match(await result('Log analysis').getByRole('status').innerText(), /4 matched \/ 4 valid records · 1 error/)
  await (await workspaceField(page, 'Trace filter (exact)')).fill('sample-trace-b')
  await (await workspaceField(page, 'Service filter (exact)')).fill('orders')
  await run('Analyze logs', 'Log analysis')
  assert.match(await result('Log analysis').getByRole('status').innerText(), /1 matched/)
  assert.doesNotMatch(await copy(), /sample-trace|orders|message|timeout/)
  await (await workspaceField(page, 'Structured logs · JSONL', { exact: true })).fill('private-malformed\n{"level":"error","message":"private-log-body"}')
  await (await workspaceField(page, 'Trace filter (exact)')).fill('')
  await (await workspaceField(page, 'Service filter (exact)')).fill('')
  await run('Analyze logs', 'Log analysis')
  assert.match(await result('Log analysis').getByRole('status').innerText(), /1 invalid lines/)
  assert.doesNotMatch(await result('Log analysis').innerText(), /private-/)
  assert.doesNotMatch(await page.evaluate(() => JSON.stringify(localStorage)), /private-/)
  await page.locator('header').getByRole('link', { name: 'All tools', exact: true }).click()
  await page.getByRole('heading', { name: 'Developer workflows', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Structured Log Explorer', exact: true }).first().click()
  assert.equal(await workspaceValue(page, 'Structured logs · JSONL'), '')
  assert.deepEqual(external, []); assert.deepEqual(errors, [])
  console.log('PASS API single/compare/filter, keyed drift/duplicate/report, trace filters, malformed logs, privacy and clearing on navigation; no external requests or renderer errors')
} catch (error) { console.error(await page.locator('#workspace').innerText()); throw error } finally { await browser.close(); await new Promise(done => server.close(done)) }
