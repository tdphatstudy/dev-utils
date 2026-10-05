import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import assert from 'node:assert/strict'

// Production-renderer smoke with a test-only bridge and controlled clipboard.
// No native files, vault data, user clipboard or network service is accessed.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = resolve('out/renderer')
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }
const server = createServer(async (req, res) => {
  try {
    const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname)
    if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return }
    const bytes = await readFile(path)
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' }).end(bytes)
  } catch { res.writeHead(404).end() }
})
const browser = await chromium.launch({ channel: process.env.UX_BROWSER_CHANNEL || undefined, headless: true })
await new Promise(done => server.listen(0, '127.0.0.1', done))
const url = `http://127.0.0.1:${server.address().port}/index.html`
const page = await browser.newPage({ viewport: { width: 1200, height: 760 } })
page.setDefaultTimeout(10000)
const errors = []
page.on('pageerror', error => errors.push(error.message))
await page.addInitScript(() => {
  const state = window.__sharedUi = { copies: [], pending: [] }
  const status = () => ({ running: false, port: null, baseUrl: null, name: null, startedAt: null, requests: 0, logs: [] })
  window.devutils = {
    platform: async () => 'win32',
    app: { trayAvailable: async () => true, onOpenTool: () => () => {} },
    window: { minimize() {}, maximize() {}, close() {} },
    privateBox: { ensureDefault: async () => ({ id: 'fixture' }) },
    mockApi: { status: async () => status(), getConfig: async () => null }
  }
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
    writeText: text => new Promise((done, fail) => { state.copies.push(text); state.pending.push({ done, fail }) })
  } })
})
const settleCopy = async fail => {
  await page.evaluate(fail => {
    const request = window.__sharedUi.pending.shift()
    if (!request) throw new Error('No clipboard request pending')
    if (fail) request.fail(new Error('Fixture clipboard failure'))
    else request.done()
  }, fail)
}

try {
  await page.goto(url + '#/tool/json.studio')
  const input = page.getByRole('textbox', { name: 'JSON input', exact: true })
  const copy = page.getByRole('button', { name: 'Copy output', exact: true })
  await input.waitFor()
  await copy.click()
  assert.equal(await copy.getAttribute('aria-busy'), 'true')
  assert.equal(await copy.isDisabled(), true)
  await input.fill('{ broken')
  await settleCopy(false)
  assert.equal(await page.getByRole('button', { name: 'Copied', exact: true }).count(), 0, 'Stale clipboard response reported success for changed output')
  assert.equal(await copy.isDisabled(), true)
  assert.equal(await input.getAttribute('aria-invalid'), 'true')
  assert.ok(await input.getAttribute('aria-describedby'))
  await page.getByRole('button', { name: 'Go to error', exact: true }).click()
  assert.equal(await input.evaluate(element => element === document.activeElement), true)
  await input.fill('{"fixture":"fresh result"}')
  await copy.click()
  await settleCopy(true)
  await page.getByRole('button', { name: 'Copy failed · retry', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Copy failed · retry', exact: true }).click()
  await settleCopy(false)
  await page.getByRole('button', { name: 'Copied', exact: true }).waitFor()
  assert.equal(await input.getAttribute('aria-invalid'), null)
  console.log('PASS pending clipboard control, stale-result guard, retry and linked editor diagnostics')

  await page.getByLabel('Open text file', { exact: true }).setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from([0xc3, 0x28]) })
  await page.getByRole('alert').filter({ hasText: 'UTF-8' }).waitFor()
  assert.equal(await input.innerText(), '{"fixture":"fresh result"}', 'Invalid file replaced input')
  await input.fill('{"fixture":"recovered by editing"}')
  assert.equal(await page.getByRole('alert').filter({ hasText: 'UTF-8' }).count(), 0, 'Old file error remained after recovery')
  for (const width of [720, 900, 1200]) {
    await page.setViewportSize({ width, height: 500 })
    const pane = page.locator('.mac-split-pane')
    const box = await pane.boundingBox()
    assert.ok(box)
    const columns = await pane.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)
    assert.equal(columns, box.width >= 680 ? 2 : 1, `Pane split ignored actual workspace width at ${width}px`)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false)
  }
  console.log('PASS UTF-8 recovery and workspace-sized panes at 720/900/1200 × 500')

  await page.goto(url + '#/tool/network.mock-api')
  const opener = page.getByRole('button', { name: 'Add endpoint', exact: true })
  await opener.click()
  const dialog = page.getByRole('dialog', { name: 'Endpoint', exact: true })
  await dialog.waitFor()
  assert.equal(await dialog.getByLabel('Endpoint name').evaluate(element => element === document.activeElement), true, 'Close icon stole initial input focus')
  for (let index = 0; index < 10; index++) {
    await page.keyboard.press('Tab')
    assert.equal(await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]')), true)
  }
  const box = await dialog.boundingBox()
  assert.ok(box && box.y >= 0 && box.y + box.height <= 500, 'Modal exceeded short desktop window')
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(await opener.evaluate(element => element === document.activeElement), true, 'Close did not restore opener focus')
  await opener.click()
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  console.log('PASS explicit modal close, initial input focus, tab containment, Esc and opener restoration')
  assert.deepEqual(errors, [])
} finally {
  await browser.close()
  await new Promise(done => server.close(done))
}
