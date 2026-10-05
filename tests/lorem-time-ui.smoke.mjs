import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import assert from 'node:assert/strict'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = resolve('out/renderer')
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }
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
page.setDefaultTimeout(10000)
const requests = [], errors = []
page.on('request', request => requests.push(request.url()))
page.on('pageerror', error => errors.push(error.message))
await page.addInitScript(() => {
  window.__tools = { copied: '', failCopy: false }
  window.devutils = {
    platform: async () => 'win32', app: { trayAvailable: async () => true, onOpenTool: () => () => {} },
    window: { minimize() {}, maximize() {}, close() {} }, privateBox: { ensureDefault: async () => ({ id: 'fixture' }) }
  }
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { if (window.__tools.failCopy) throw new Error('Fixture clipboard denial'); window.__tools.copied = text } } })
})
const row = label => page.locator('dl > div').filter({ has: page.getByText(label, { exact: true }) }).locator('dd')
const noOverflow = async name => {
  await page.setViewportSize({ width: 720, height: 600 })
  const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }))
  assert.ok(size.document <= size.viewport, `${name}: horizontal overflow at minimum desktop width`)
}
try {
  await page.goto(url + '#/')
  await page.getByRole('heading', { name: 'DevFusion', exact: true }).waitFor()
  assert.ok(!requests.some(value => /\/(?:LoremTool|TimestampTool|DateTool)-/.test(value)), 'Home eagerly loaded Lorem/time UIs')
  await page.goto(url + '#/tool/text.lorem')
  await page.getByLabel('Paragraph count', { exact: true }).fill('2')
  await page.getByLabel('Words per sentence', { exact: true }).fill('5')
  await page.getByLabel('Sentences per paragraph', { exact: true }).fill('2')
  const lorem = page.getByRole('textbox', { name: 'Generated Lorem text', exact: true })
  await page.waitForFunction(() => document.querySelector('#lorem-output').value.split(/\s+/).length === 20)
  const original = await lorem.inputValue()
  assert.equal(original.split('\n\n').length, 2)
  assert.equal(original.match(/\./g).length, 4)
  await page.getByRole('button', { name: 'Copy', exact: true }).click()
  assert.equal(await page.evaluate(() => window.__tools.copied), original)
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save .txt', exact: true }).click()
  const download = await downloadPromise
  assert.equal(download.suggestedFilename(), 'lorem.txt')
  assert.equal(await readFile(await download.path(), 'utf8'), original)
  await page.getByLabel('Paragraph count', { exact: true }).fill('10000')
  await page.getByRole('alert').filter({ hasText: 'exceeds 10,000 words' }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Regenerate', exact: true }).isDisabled(), true)
  assert.equal(await page.getByRole('button', { name: 'Copy', exact: true }).isDisabled(), true)
  await page.getByRole('button', { name: 'Words', exact: true }).click()
  await page.getByLabel('Word count', { exact: true }).fill('8')
  await page.waitForFunction(() => document.querySelector('#lorem-output').value.split(' ').length === 8)
  await page.evaluate(() => { window.__tools.failCopy = true })
  await page.getByRole('button', { name: 'Copy', exact: true }).click()
  await page.getByRole('button', { name: 'Copy failed · retry', exact: true }).waitFor()
  await page.evaluate(() => { window.__tools.failCopy = false })
  await page.getByRole('button', { name: 'Copy failed · retry', exact: true }).click()
  await page.getByRole('button', { name: 'Copied', exact: true }).waitFor()
  await noOverflow('Lorem')
  console.log('PASS Lorem exact counts, generation bounds, clipboard retry, real text download and lazy/responsive UI')

  await page.goto(url + '#/tool/time.timestamp')
  await page.getByLabel('Unix timestamp', { exact: true }).fill('1700000000.123')
  await page.getByLabel('Display timezone', { exact: true }).fill('UTC')
  await row('Unix milliseconds').filter({ hasText: '1700000000123' }).waitFor()
  await page.getByLabel('Unix timestamp unit', { exact: true }).selectOption('milliseconds')
  assert.equal(await page.getByLabel('Unix timestamp', { exact: true }).inputValue(), '1700000000123')
  assert.equal(await row('ISO 8601 · UTC').textContent(), '2023-11-14T22:13:20.123Z')
  await page.getByRole('button', { name: 'Date / ISO', exact: true }).click()
  assert.equal(await page.getByLabel('ISO date or date-time', { exact: true }).inputValue(), '2023-11-14T22:13:20.123Z')
  await page.getByLabel('ISO date or date-time', { exact: true }).fill('2026-03-08T07:30:00Z')
  await page.getByLabel('Display timezone', { exact: true }).fill('America/New_York')
  await row('UTC offset at this instant').filter({ hasText: '-04:00' }).waitFor()
  assert.ok((await page.locator('dd').allTextContents()).includes('2026-03-08T03:30:00.000-04:00'))
  await page.getByLabel('ISO date or date-time', { exact: true }).fill('2026-02-30T12:00:00Z')
  await page.getByRole('alert').filter({ hasText: 'real calendar date' }).waitFor()
  assert.equal(await page.locator('dd').count(), 0, 'Invalid timestamp kept stale output')
  await page.getByLabel('ISO date or date-time', { exact: true }).fill('2026-10-05T09:30:00')
  await page.getByRole('alert').filter({ hasText: 'with Z / UTC offset' }).waitFor()
  await page.getByLabel('ISO date or date-time', { exact: true }).fill('1969-12-31T23:59:59.999Z')
  await row('Unix seconds').filter({ hasText: '-0.001' }).waitFor()
  await page.getByLabel('Display timezone', { exact: true }).fill('wrong/zone')
  await page.getByRole('alert').filter({ hasText: 'Unknown timezone' }).waitFor()
  await page.getByRole('button', { name: 'UTC', exact: true }).click()
  await noOverflow('Timestamp')
  console.log('PASS timestamp units and input modes preserve the instant, strict ISO, negative epochs, IANA/DST offsets and responsive UI')

  await page.goto(url + '#/tool/time.date')
  await page.getByLabel('Start date', { exact: true }).fill('2024-01-31')
  await page.getByLabel('Amount', { exact: true }).fill('1')
  await page.getByLabel('Calendar unit', { exact: true }).selectOption('months')
  await page.locator('output').filter({ hasText: '2024-02-29' }).waitFor()
  await page.getByLabel('End date', { exact: true }).fill('2024-02-29')
  await page.locator('output').filter({ hasText: '29 calendar days' }).waitFor()
  await page.getByLabel('Amount', { exact: true }).fill('1.5')
  await page.getByRole('alert').filter({ hasText: 'whole number' }).waitFor()
  await page.getByLabel('Amount', { exact: true }).fill('-1')
  await page.locator('output').filter({ hasText: '2023-12-31' }).waitFor()
  await noOverflow('Calendar dates')
  await page.getByRole('button', { name: 'Elapsed time', exact: true }).click()
  await page.getByLabel('Start instant · ISO with Z / offset', { exact: true }).fill('2026-03-08T00:00:00-05:00')
  await page.getByLabel('End instant · ISO with Z / offset', { exact: true }).fill('2026-03-09T00:00:00-04:00')
  await page.getByLabel('Duration unit', { exact: true }).selectOption('days')
  await page.locator('output').filter({ hasText: '2026-03-09T05:00:00.000Z' }).waitFor()
  await page.locator('output').filter({ hasText: '23h' }).waitFor()
  await page.getByLabel('Amount', { exact: true }).fill('0.29')
  await page.getByLabel('Duration unit', { exact: true }).selectOption('hours')
  await page.locator('output').filter({ hasText: '2026-03-08T05:17:24.000Z' }).waitFor()
  await page.getByLabel('Amount', { exact: true }).fill('0.0001')
  await page.getByLabel('Duration unit', { exact: true }).selectOption('seconds')
  await page.getByRole('alert').filter({ hasText: 'whole number of milliseconds' }).waitFor()
  await noOverflow('Elapsed time')
  assert.deepEqual(errors, [])
  console.log('PASS calendar leap/clamp/signed differences, exact decimal durations, DST calendar-versus-elapsed behavior and 720px layout')
} finally {
  const closed = new Promise(ok => server.close(ok)); server.closeAllConnections(); await browser.close(); await closed
}
