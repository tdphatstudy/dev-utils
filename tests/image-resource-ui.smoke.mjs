import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const root = resolve('out/renderer')
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost')
    const path = resolve(root, '.' + (url.pathname === '/' ? '/index.html' : url.pathname))
    if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return }
    res.writeHead(200, { 'Content-Type': mime[extname(path)] ?? 'application/octet-stream' }).end(await readFile(path))
  } catch { res.writeHead(404).end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
let browser
try {
  browser = await chromium.launch({ channel: process.env.UX_BROWSER_CHANNEL || undefined, headless: true })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
  await page.addInitScript(() => {
    window.__imageResources = { bitmap: 0, images: 0, blobs: 0 }
    const original = window.createImageBitmap
    window.createImageBitmap = (...args) => { window.__imageResources.bitmap++; return original(...args) }
    const ImageConstructor = window.Image
    window.Image = new Proxy(ImageConstructor, { construct(target, args) { window.__imageResources.images++; return Reflect.construct(target, args) } })
    const create = URL.createObjectURL
    URL.createObjectURL = (...args) => { window.__imageResources.blobs++; return create(...args) }
  })
  const bomb = Buffer.alloc(24)
  bomb.set([137, 80, 78, 71, 13, 10, 26, 10])
  bomb.writeUInt32BE(100_000, 16); bomb.writeUInt32BE(100_000, 20)
  const upload = { name: 'small-pixel-bomb.png', mimeType: 'image/png', buffer: bomb }

  await page.goto(`${origin}/#/tool/convert.image`)
  await page.locator('[data-tool-ready="convert.image"]').waitFor()
  const source = page.getByLabel('Choose source image', { exact: true })
  await source.setInputFiles(upload)
  await page.getByText(/Image exceeds 16 million pixels/).waitFor()
  assert.deepEqual(await page.evaluate(() => window.__imageResources), { bitmap: 0, images: 0, blobs: 0 })

  await source.setInputFiles({ name: 'valid.png', mimeType: 'image/png', buffer: await readFile('tests/fixtures/image-ux/pixel.png') })
  await page.getByRole('button', { name: 'Convert', exact: true }).click()
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Download' && !button.disabled))
  assert.ok(await page.evaluate(() => window.__imageResources.bitmap >= 2))
  console.log('PASS Image Convert rejects pixel bombs before bitmap/blob allocation, then converts a valid image')

  await page.goto(`${origin}/#/tool/text.qr`)
  await page.locator('[data-tool-ready="text.qr"]').waitFor()
  await page.getByRole('button', { name: 'QR → Text', exact: true }).click()
  await page.evaluate(() => { window.__imageResources = { bitmap: 0, images: 0, blobs: 0 } })
  await page.locator('input[type="file"]').setInputFiles(upload)
  await page.getByText(/Image exceeds 16 million pixels/).waitFor()
  assert.deepEqual(await page.evaluate(() => window.__imageResources), { bitmap: 0, images: 0, blobs: 0 })
  console.log('PASS QR rejects pixel bombs before Image/blob allocation; no renderer errors')
  assert.deepEqual(errors, [])
} finally {
  await browser?.close()
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
}
