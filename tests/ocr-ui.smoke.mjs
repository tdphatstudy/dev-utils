import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve, extname, sep, join } from 'node:path'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
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
page.setDefaultTimeout(10000)
const requests = [], errors = []
page.on('request', request => requests.push(request.url()))
page.on('pageerror', error => errors.push(error.message))
await page.addInitScript(() => {
  const state = window.__ocr = { calls: [], cancel: [], pending: null, delay: false, progress: null, copied: '', failCopy: false }
  const output = { text: 'DevFusion OCR fixture\nTiếng Việt <script>literal</script>', pages: 2, ocrPages: 1, confidence: 93 }
  const run = async request => {
    state.calls.push({ id: request.id, kind: request.kind, mode: request.mode, language: request.language, forceOcr: request.forceOcr })
    state.progress?.({ id: request.id, stage: 'Recognizing text', page: 1, total: 2, percent: 50 })
    if (state.delay) return new Promise(ok => { state.pending = ok })
    return output
  }
  window.devutils = {
    platform: async () => 'win32', app: { trayAvailable: async () => true, onOpenTool: () => () => {} },
    window: { minimize() {}, maximize() {}, close() {} }, privateBox: { ensureDefault: async () => ({ id: 'fixture' }) },
    ocr: { recognize: run, capture: run, cancel: async id => { state.cancel.push(id); state.pending?.(null); state.pending = null; return true }, onProgress: callback => { state.progress = callback; return () => { state.progress = null } } }
  }
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { if (state.failCopy) throw new Error('Fixture copy denied'); state.copied = text } } })
})
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64')
try {
  await page.goto(url + '#/')
  await page.getByRole('heading', { name: 'DevFusion', exact: true }).waitFor()
  assert.ok(!requests.some(value => /ocr-assets|tesseract|\/pdf-/.test(value)))
  await page.getByRole('link', { name: 'OCR · Image / PDF', exact: true }).click()
  await page.getByRole('button', { name: 'Extract file text', exact: true }).waitFor()
  assert.ok(!requests.some(value => /ocr-assets|tesseract|\/pdf-/.test(value)), 'Opening OCR preloaded its engines')
  assert.equal(await page.getByRole('button', { name: 'Extract file text', exact: true }).isDisabled(), true)
  await page.getByLabel('Upload image or PDF').setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: png })
  await page.getByRole('button', { name: 'Extract file text', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Text is ready.' }).waitFor()
  assert.match(await page.getByRole('textbox', { name: 'Extracted text', exact: true }).inputValue(), /<script>literal<\/script>/)
  await page.getByRole('textbox', { name: 'Extracted text', exact: true }).fill('Corrected text')
  await page.getByRole('button', { name: 'Copy', exact: true }).click()
  assert.equal(await page.evaluate(() => window.__ocr.copied), 'Corrected text')
  await page.evaluate(() => { window.__ocr.failCopy = true })
  await page.getByRole('button', { name: 'Copy', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Copy failed.' }).waitFor()
  await page.evaluate(() => { window.__ocr.failCopy = false })
  await page.getByRole('button', { name: 'Copy', exact: true }).click()
  await page.getByRole('checkbox', { name: /OCR every PDF page/ }).check()
  await page.getByRole('button', { name: 'Extract file text', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Text is ready.' }).waitFor()
  assert.equal(await page.evaluate(() => window.__ocr.calls.at(-1).forceOcr), true)
  console.log('PASS OCR UI upload, language/mode, literal text, corrections and clipboard retry; no engine preload')
  await page.evaluate(() => { window.__ocr.delay = true })
  await page.getByRole('button', { name: 'Select region', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Recognizing text' }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Extract file text', exact: true }).isDisabled(), true)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Extraction canceled.' }).waitFor()
  assert.equal(await page.evaluate(() => window.__ocr.calls.at(-1).mode), 'region')
  assert.match(await page.getByRole('textbox', { name: 'Extracted text', exact: true }).inputValue(), /DevFusion OCR fixture/)
  await page.getByLabel('Upload image or PDF').setInputFiles({ name: 'fake.pdf', mimeType: 'application/pdf', buffer: png })
  await page.getByRole('alert').filter({ hasText: 'file content must match' }).waitFor()
  const bomb = Buffer.alloc(24); bomb.set([137, 80, 78, 71]); bomb.writeUInt32BE(100000, 16); bomb.writeUInt32BE(100000, 20)
  await page.getByLabel('Upload image or PDF').setInputFiles({ name: 'huge.png', mimeType: 'image/png', buffer: bomb })
  await page.getByRole('alert').filter({ hasText: '16 million pixels' }).waitFor()
  await page.getByRole('button', { name: 'Current screen', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Recognizing text' }).waitFor()
  await page.getByRole('link', { name: 'Color Picker', exact: true }).click()
  await page.getByRole('button', { name: 'Pick screen color', exact: true }).waitFor()
  assert.equal(await page.evaluate(() => window.__ocr.cancel.length), 2)
  await page.getByRole('link', { name: 'OCR · Image / PDF', exact: true }).click()
  assert.equal(await page.getByRole('textbox', { name: 'Extracted text', exact: true }).inputValue(), '')
  console.log('PASS cancellation preserves prior text, invalid file/pixel limits, leaving tool cancels and clears results')
  await page.setViewportSize({ width: 720, height: 600 })
  const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }))
  assert.ok(size.document <= size.viewport, 'OCR horizontal overflow at minimum window width')
  if (process.env.BRAND_SCREENSHOT_DIR) {
    await mkdir(process.env.BRAND_SCREENSHOT_DIR, { recursive: true })
    await page.setViewportSize({ width: 1100, height: 820 })
    await page.screenshot({ path: join(process.env.BRAND_SCREENSHOT_DIR, 'devfusion-ocr-dark.png') })
    await page.evaluate(() => document.documentElement.classList.remove('dark'))
    await page.screenshot({ path: join(process.env.BRAND_SCREENSHOT_DIR, 'devfusion-ocr-light.png') })
  }
  const preview = await browser.newPage()
  await preview.goto(url + '#/tool/text.ocr')
  await preview.getByRole('alert').filter({ hasText: 'OCR requires the DevFusion desktop app.' }).waitFor()
  assert.equal(await preview.getByRole('button', { name: 'Select region', exact: true }).isDisabled(), true)
  await preview.close(); assert.deepEqual(errors, [])
  console.log('PASS OCR responsive layout and honest desktop-required state')
  const helper = await browser.newPage({ viewport: { width: 800, height: 600 } })
  await helper.addInitScript(() => {
    const state = window.__helper = { ready: false, rect: null, closed: false }
    const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 1200
    canvas.getContext('2d').fillRect(0, 0, 1600, 1200)
    window.ocrHelper = { view: async () => ({ kind: 'region', image: canvas.toDataURL() }), ready: async () => { state.ready = true }, select: async selection => { state.rect = selection.rect; const d = new DataView(selection.bytes.buffer); state.pixels = { width: d.getUint32(16), height: d.getUint32(20) } }, close: async () => { state.closed = true } }
  })
  await helper.goto(pathToFileURL(resolve('resources/ocr-helper.html')).href)
  await helper.waitForFunction(() => window.__helper.ready)
  // Reverse drag on a 2x native-pixel frame, avoiding the top hint controls.
  await helper.mouse.move(500, 400); await helper.mouse.down(); await helper.mouse.move(100, 200); await helper.mouse.up()
  await helper.waitForFunction(() => window.__helper.rect)
  assert.deepEqual(await helper.evaluate(() => window.__helper.rect), { x: .125, y: 1 / 3, width: .5, height: 1 / 3 })
  assert.deepEqual(await helper.evaluate(() => window.__helper.pixels), { width: 800, height: 400 })
  await helper.keyboard.press('Escape'); assert.equal(await helper.evaluate(() => window.__helper.closed), true)
  await helper.close()
  console.log('PASS region overlay reverse drag, mixed DPI coordinates and Escape cancel')
} finally {
  const closed = new Promise(ok => server.close(ok)); server.closeAllConnections(); await browser.close(); await closed
}
