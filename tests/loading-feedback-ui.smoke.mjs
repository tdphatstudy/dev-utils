import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, extname, sep, join } from 'node:path'
import assert from 'node:assert/strict'

// Deliberately hold/abort production chunk requests. This tests loading behavior,
// not real device latency. Every page uses an isolated, fixture-only profile.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = resolve('out/renderer')
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname
    const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname))
    if (!path.startsWith(root + sep)) { response.writeHead(403).end(); return }
    response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' }).end(await readFile(path))
  } catch { response.writeHead(404).end() }
})
const browser = await chromium.launch({ channel: process.env.UX_BROWSER_CHANNEL || undefined, headless: true })
await new Promise((done) => server.listen(0, '127.0.0.1', done))
const url = `http://127.0.0.1:${server.address().port}`
const page = await browser.newPage({ viewport: { width: 1180, height: 760 } })
page.setDefaultTimeout(15000)
const errors = [], report = { scenarios: [], paletteViews: [] }
page.on('pageerror', (error) => errors.push(error.message))
await page.addInitScript(() => {
  window.devutils = {
    platform: async () => 'win32',
    window: { close() {}, minimize() {}, maximize() {} },
    app: { trayAvailable: async () => true, quit: async () => {}, onOpenTool: () => () => {} },
    privateBox: { ensureDefault: async () => ({ id: 'fixture' }) }
  }
})
const screenshot = async (name) => {
  if (!process.env.BRAND_SCREENSHOT_DIR) return
  await mkdir(process.env.BRAND_SCREENSHOT_DIR, { recursive: true })
  await page.waitForTimeout(220) // Let the CSS-only entrance and viewport resize settle for the artifact.
  await page.screenshot({ path: join(process.env.BRAND_SCREENSHOT_DIR, name + '.png') })
}
const gateChunk = async (name) => {
  let release
  const pending = new Promise((done) => { release = done })
  let requested = false, finishHandling
  const handled = new Promise((done) => { finishHandling = done })
  const pattern = `**/assets/${name}-*.js`
  await page.route(pattern, async (route) => { requested = true; await pending; await route.continue(); finishHandling() })
  return { release, requested: () => requested, dispose: async () => { if (requested) await handled; await page.unroute(pattern) } }
}
const go = async (id) => page.evaluate((id) => { location.hash = `/tool/${id}` }, id)
const ready = async (id) => page.locator(`[data-tool-ready="${id}"]`).waitFor()
const palette = () => page.getByRole('dialog', { name: 'Search tools', exact: true })
try {
  const paletteGate = await gateChunk('CommandPaletteContents')
  await page.goto(url + '/#/')
  const homeSearch = page.getByRole('searchbox', { name: 'What would you like to do?', exact: true })
  await homeSearch.waitFor()
  await homeSearch.focus()
  await page.keyboard.press('Control+k')
  await palette().getByText('Opening tool search…', { exact: true }).waitFor()
  assert.equal(paletteGate.requested(), true)
  for (let index = 0; index < 5; index++) {
    await page.keyboard.press('Tab')
    assert.equal(await page.evaluate(() => Boolean(document.activeElement.closest('[role="dialog"]'))), true)
  }
  await page.keyboard.press('Escape')
  await palette().waitFor({ state: 'hidden' })
  assert.equal(await homeSearch.evaluate((element) => element === document.activeElement), true)
  paletteGate.release()
  await paletteGate.dispose()
  await page.keyboard.press('Control+k')
  const input = palette().getByRole('combobox', { name: 'Search tools', exact: true })
  await input.waitFor()
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Search tools')
  const inputStyle = await input.evaluate((element) => ({ outline: getComputedStyle(element).outlineStyle, rowShadow: getComputedStyle(element.parentElement).boxShadow }))
  assert.equal(inputStyle.outline, 'none')
  assert.match(inputStyle.rowShadow, /inset/)
  await input.fill('Timestamp Converter')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await ready('time.timestamp')
  assert.equal(await page.locator('#workspace').evaluate((element) => element === document.activeElement), true)
  await page.getByRole('link', { name: 'All tools', exact: true }).click()
  await homeSearch.waitFor()
  console.log('PASS first-open palette feedback, focus containment, escape/return and inset search focus')
  report.scenarios.push('palette chunk delayed and dismissed')

  const loremGate = await gateChunk('LoremTool')
  await go('text.lorem')
  const loader = page.locator('[data-loading-state]')
  await loader.getByText('Opening Lorem Text…', { exact: true }).waitFor()
  assert.equal(await page.locator('[data-tool-ready="text.lorem"]').count(), 0)
  const status = loader.getByRole('status')
  assert.equal(await status.evaluate((element) => Boolean(element.closest('[aria-busy="true"]'))), false)
  const animation = await loader.locator('.mac-loading-logo').evaluate((element) => ({ duration: getComputedStyle(element).animationDuration, iterations: getComputedStyle(element).animationIterationCount }))
  assert.equal(animation.iterations, '4')
  assert.ok(Number.parseFloat(animation.duration) * Number(animation.iterations) < 5)
  await page.setViewportSize({ width: 720, height: 500 })
  await screenshot('ux-loading-brand-dark-720')
  await page.getByRole('button', { name: 'Switch to light theme', exact: true }).click()
  await screenshot('ux-loading-brand-light-720')
  await page.getByRole('button', { name: 'Switch to dark theme', exact: true }).click()
  await loader.getByText(/This is taking longer than usual/).waitFor()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  assert.equal(await loader.locator('.mac-loading-logo').evaluate((element) => getComputedStyle(element).animationName), 'none')
  await status.waitFor()
  await loader.getByRole('link', { name: 'Back to all tools', exact: true }).click()
  await homeSearch.waitFor()
  loremGate.release()
  await loremGate.dispose()
  await go('time.timestamp')
  await ready('time.timestamp')
  assert.equal(await page.locator('[data-tool-ready="text.lorem"]').count(), 0)
  console.log('PASS finite SVG motion, truthful slow notice, reduced motion and navigation while a tool is pending')
  report.scenarios.push('slow tool loading, reduced motion, latest route wins')

  await page.route('**/assets/YamlStudio-*.js', (route) => route.abort('failed'))
  await go('yaml.studio')
  await page.getByRole('heading', { name: 'This tool could not be loaded', exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Try again', exact: true }).count(), 0)
  await page.getByRole('button', { name: 'Back to Home', exact: true }).click()
  await homeSearch.waitFor()
  await page.unroute('**/assets/YamlStudio-*.js')
  console.log('PASS failed chunk provides honest recovery without ineffective retry or automatic reload')
  report.scenarios.push('chunk failure recovery')

  for (const theme of ['dark', 'light']) {
    await page.evaluate((theme) => localStorage.setItem('devutils-app', JSON.stringify({ state: { theme, launchMode: 'home' }, version: 0 })), theme)
    await page.reload()
    await homeSearch.waitFor()
    for (const zoom of [1, 1.25, 1.5, 2]) {
      // Logical viewport after app zoom, for a physical 720×500 desktop window.
      await page.setViewportSize({ width: Math.floor(720 / zoom), height: Math.floor(500 / zoom) })
      await homeSearch.focus()
      await page.keyboard.press('Control+k')
      const field = palette().getByRole('combobox', { name: 'Search tools', exact: true })
      await field.waitFor()
      await field.fill('no-fixture-matching-tool')
      await palette().getByText('No tools found', { exact: true }).waitFor()
      const bounds = await palette().boundingBox()
      const viewport = page.viewportSize()
      assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1, `Palette exceeds logical viewport at ${theme} ${zoom}×`)
      const close = palette().getByRole('button', { name: 'Close tool search', exact: true })
      await close.focus()
      assert.equal(await close.evaluate((element) => getComputedStyle(element).outlineStyle), 'solid')
      const closeBounds = await close.boundingBox()
      assert.ok(closeBounds.y >= bounds.y && closeBounds.y + closeBounds.height <= bounds.y + bounds.height)
      await field.focus()
      assert.match(await field.evaluate((element) => getComputedStyle(element.parentElement).boxShadow), /inset/)
      if (zoom === 1 || zoom === 2) await screenshot(`ux-palette-${theme}-${zoom}x`)
      report.paletteViews.push({ theme, zoom, bounds })
      await page.keyboard.press('Escape')
      await palette().waitFor({ state: 'hidden' })
      assert.equal(await homeSearch.evaluate((element) => element === document.activeElement), true)
    }
  }
  console.log('PASS focused palette, close control and empty-state fit light/dark at 100/125/150/200% logical zoom')
  // React may emit a captured render error to the browser; only the deliberately aborted import is expected.
  assert.deepEqual(errors.filter((message) => !/dynamically imported module|importing a module script|failed to fetch/i.test(message)), [])
  if (process.env.BRAND_SCREENSHOT_DIR) await writeFile(join(process.env.BRAND_SCREENSHOT_DIR, 'loading-feedback-results.json'), JSON.stringify(report, null, 2))
} finally {
  await browser.close()
  await new Promise((done) => server.close(done))
}