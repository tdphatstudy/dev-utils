import { workspaceField, workspaceValue } from './tool-workspace.fixture.mjs'
import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve, extname, sep, join } from 'node:path'
import assert from 'node:assert/strict'

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
await new Promise((done) => server.listen(0, '127.0.0.1', done))
const url = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ channel: process.env.UX_BROWSER_CHANNEL || undefined, headless: true })
const page = await browser.newPage({ viewport: { width: 1180, height: 760 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
await page.route('**/*', (route) => new URL(route.request().url()).origin === url ? route.continue() : route.abort())
const capture = async (name) => {
  if (!process.env.BRAND_SCREENSHOT_DIR) return
  await mkdir(process.env.BRAND_SCREENSHOT_DIR, { recursive: true })
  await page.screenshot({ path: join(process.env.BRAND_SCREENSHOT_DIR, name + '.png'), animations: 'disabled' })
}
const open = async (id) => {
  await page.goto(`${url}/#/tool/${id}`)
  await page.locator(`[data-tool-ready="${id}"]`).waitFor()
}
try {
  await page.goto(url)
  for (const theme of ['dark', 'light']) {
    await page.evaluate((theme) => localStorage.setItem('devutils-app', JSON.stringify({ state: { theme, surfaceMode: 'glass', motionMode: 'system' }, version: 0 })), theme)
    for (const [width, height] of [[1180, 760], [720, 500]]) {
      await page.setViewportSize({ width, height })
      await page.goto(url + '/#/')
      await page.reload()
      await page.getByRole('heading', { name: 'Developer workflows', exact: true }).waitFor()
      assert.match(await page.locator('aside').evaluate((element) => getComputedStyle(element).backdropFilter), /blur/)
      assert.equal(await page.locator('#workspace').evaluate((element) => element.scrollWidth <= element.clientWidth), true)
      await capture(`enterprise-home-${theme}-${width}`)
      await open('security.env')
      await page.getByRole('button', { name: 'Load example', exact: true }).click()
      await page.getByRole('button', { name: 'Compare environments', exact: true }).click()
      await page.getByRole('heading', { name: 'Comparison results' }).waitFor()
      assert.equal(await page.locator('#workspace').evaluate((element) => element.scrollWidth <= element.clientWidth), true)
      await capture(`enterprise-env-${theme}-${width}`)
    }
  }
  await page.setViewportSize({ width: 1180, height: 760 })
  await open('security.env')
  await (await workspaceField(page, 'Baseline · expected configuration')).fill('TOKEN=fixture-private-base\nREQUIRED=yes')
  await (await workspaceField(page, 'Target · configuration to check')).fill('TOKEN=fixture-private-target\nEXTRA=yes')
  await page.keyboard.press('Control+Enter')
  await page.getByRole('heading', { name: 'Comparison results' }).waitFor()
  assert.match(await page.locator('section[aria-labelledby="env-results"]').getByRole('status').first().innerText(), /1 missing · 1 target only · 1 changed/)
  assert.doesNotMatch(await page.locator('table').innerText(), /fixture-private/)
  await page.evaluate(() => { window.fixtureCopy = ''; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { window.fixtureCopy = text } } }) })
  await page.getByRole('button', { name: 'Copy report (no values)' }).click()
  assert.doesNotMatch(await page.evaluate(() => window.fixtureCopy), /fixture-private/)
  assert.match(await page.evaluate(() => window.fixtureCopy), /MISSING\s+REQUIRED/)
  assert.doesNotMatch(await page.evaluate(() => JSON.stringify(localStorage)), /fixture-private/)
  await (await workspaceField(page, 'Target · configuration to check')).fill('TOKEN=updated')
  assert.equal(await page.getByRole('heading', { name: 'Comparison results' }).count(), 0)
  await page.locator('header').getByRole('link', { name: 'All tools', exact: true }).click()
  await page.getByRole('heading', { name: 'Developer workflows', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Environment Compare', exact: true }).first().click()
  assert.equal(await workspaceValue(page, 'Baseline · expected configuration'), '')
  console.log('PASS env workflow: hidden values, redacted report, invalidated result, no persistence and navigation clears inputs')
  await open('app.settings')
  await page.getByRole('group', { name: 'Surface', exact: true }).getByRole('button', { name: 'Solid', exact: true }).click()
  await page.getByRole('group', { name: 'Motion', exact: true }).getByRole('button', { name: 'Reduced', exact: true }).click()
  assert.equal(await page.locator('aside').evaluate((element) => getComputedStyle(element).backdropFilter), 'none')
  await page.reload()
  await page.getByRole('group', { name: 'Motion', exact: true }).waitFor()
  assert.equal(await page.locator('html').getAttribute('data-motion'), 'reduced')
  await open('security.env')
  assert.equal(await page.locator('[data-tool-ready]').evaluate((element) => getComputedStyle(element).animationName), 'none')
  await page.evaluate(() => localStorage.setItem('devutils-app', JSON.stringify({ state: { theme: 'dark', surfaceMode: 'glass', motionMode: 'system' }, version: 0 })))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  await page.locator('[data-tool-ready]').waitFor()
  assert.equal(await page.locator('[data-tool-ready]').evaluate((element) => getComputedStyle(element).animationName), 'none')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.getByRole('button', { name: 'Search tools', exact: true }).click()
  await page.getByRole('dialog', { name: 'Search tools', exact: true }).waitFor()
  await capture('enterprise-palette')
  await page.keyboard.press('Escape')
  assert.equal(await page.getByRole('dialog').count(), 0)
  assert.deepEqual(errors, [])
  console.log('PASS glass/solid, persisted reduced motion, OS reduced motion, light/dark 1180x760 and 720x500, palette Escape, no renderer errors')
} finally { await browser.close(); await new Promise((done) => server.close(done)) }
