import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, extname, sep, join } from 'node:path'
import assert from 'node:assert/strict'

// Production renderer in an isolated browser. Native operations are unavailable
// during the catalogue sweep; the window-control check uses a RAM-only fixture.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = resolve('out/renderer')
const source = await readFile('src/renderer/src/registry/tools.ts', 'utf8')
const catalogue = [...source.slice(source.indexOf('export const tools:')).matchAll(/id: '([^']+)'[\s\S]*?name: '([^']+)'/g)].map((match) => ({ id: match[1], name: match[2] }))
assert.ok(catalogue.length >= 30)
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
const errors = [], report = { tools: catalogue.length, views: [], contrast: [] }
page.on('pageerror', (error) => errors.push(error.message))
await page.route('**/*', (route) => new URL(route.request().url()).origin === url ? route.continue() : route.abort())
const screenshot = async (name) => {
  if (!process.env.BRAND_SCREENSHOT_DIR) return
  await mkdir(process.env.BRAND_SCREENSHOT_DIR, { recursive: true })
  await page.screenshot({ path: join(process.env.BRAND_SCREENSHOT_DIR, name + '.png'), animations: 'disabled' })
}
const settle = async () => {
  await page.locator('[data-loading-state]').waitFor({ state: 'hidden' })
  await page.waitForTimeout(60)
}
const luminance = (rgb) => rgb.map((value) => value / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05)
try {
  await page.goto(url + '/#/')
  await page.getByRole('heading', { name: 'DevFusion', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Minimize', exact: true }).isDisabled().then((disabled) => assert.equal(disabled, true))
  await page.getByRole('button', { name: 'Maximize', exact: true }).isDisabled().then((disabled) => assert.equal(disabled, true))
  const skip = page.getByRole('link', { name: 'Skip to workspace', exact: true })
  await skip.focus()
  await page.waitForFunction(() => document.querySelector('a.mac-skip-link').getBoundingClientRect().y >= 0)
  assert.ok((await skip.boundingBox()).y >= 0)
  await page.keyboard.press('Enter')
  assert.equal(await page.locator('#workspace').evaluate((element) => element === document.activeElement), true)
  assert.match(page.url(), /#\/$/)
  console.log('PASS skip link focuses workspace without changing route; preview window controls are disabled')
  for (const theme of ['dark', 'light']) {
    await page.evaluate((theme) => { localStorage.setItem('devutils-app', JSON.stringify({ state: { theme, sidebarCollapsed: false, launchMode: 'home', recentToolIds: [] }, version: 0 })) }, theme)
    await page.reload()
    await page.getByRole('heading', { name: 'DevFusion', exact: true }).waitFor()
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).colorScheme), theme)
    const colors = await page.evaluate(() => {
      const parse = (value) => { const values = value.match(/[\d.]+/g).map(Number); return [...values.slice(0, 3), values[3] ?? 1] }
      const read = (name) => {
        const probe = document.createElement('span'); probe.style.color = `var(${name})`; document.body.append(probe)
        const result = parse(getComputedStyle(probe).color); probe.remove(); return result
      }
      const background = read('--mac-bg')
      const merge = (front, back) => front.slice(0, 3).map((value, index) => value * front[3] + back[index] * (1 - front[3]))
      const surfaces = ['--mac-bg', '--mac-surface', '--mac-raised', '--mac-sidebar'].map((name) => ({ name, rgb: merge(read(name), background) }))
      const controls = surfaces.flatMap((surface) => ['--mac-control', '--mac-control-hover'].map((name) => ({ name: surface.name + name, rgb: merge(read(name), surface.rgb) })))
      return {
        surfaces: [...surfaces, ...controls],
        text: ['--mac-label', '--mac-label-secondary', '--mac-label-tertiary', '--mac-accent', '--mac-danger', '--mac-success', '--mac-warning'].map((name) => ({ name, rgb: read(name).slice(0, 3) })),
        fills: ['--mac-accent-fill', '--mac-accent-fill-hover', '--mac-danger-fill'].map((name) => ({ name, rgb: read(name).slice(0, 3) })),
        border: read('--mac-input-border').slice(0, 3)
      }
    })
    for (const color of colors.text) {
      const minimum = Math.min(...colors.surfaces.map((surface) => contrast(color.rgb, surface.rgb)))
      report.contrast.push({ theme, token: color.name, minimum: Number(minimum.toFixed(2)) })
      assert.ok(minimum >= 4.5, `${theme} ${color.name} text contrast ${minimum.toFixed(2)} < 4.5`)
    }
    for (const color of colors.fills) assert.ok(contrast([255, 255, 255], color.rgb) >= 4.5, `${theme} ${color.name} white text`)
    for (const surface of colors.surfaces.filter((surface) => !surface.name.includes('hover'))) assert.ok(contrast(colors.border, surface.rgb) >= 3, `${theme} input edge contrast on ${surface.name}`)
    const opacityUtilities = await page.evaluate(() => {
      const probe = document.createElement('span')
      probe.className = 'bg-mac-danger/10 border border-mac-accent/40'
      document.body.append(probe)
      const style = getComputedStyle(probe), canvas = document.createElement('canvas')
      canvas.width = canvas.height = 1
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = style.backgroundColor; ctx.fillRect(0, 0, 1, 1)
      const backgroundAlpha = ctx.getImageData(0, 0, 1, 1).data[3]
      ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = style.borderTopColor; ctx.fillRect(0, 0, 1, 1)
      const borderAlpha = ctx.getImageData(0, 0, 1, 1).data[3]
      probe.remove()
      return { backgroundAlpha, borderAlpha }
    })
    assert.ok(opacityUtilities.backgroundAlpha >= 24 && opacityUtilities.backgroundAlpha <= 27, 'Semantic tint /10 was not generated')
    assert.ok(opacityUtilities.borderAlpha >= 100 && opacityUtilities.borderAlpha <= 104, 'Accent border /40 was not generated')
    await screenshot('ux-home-' + theme)
    for (const viewport of [{ width: 1180, height: 760 }, { width: 720, height: 500 }]) {
      await page.setViewportSize(viewport)
      for (const tool of catalogue) {
        await page.goto(url + '/#/tool/' + tool.id)
        await page.getByRole('heading', { name: tool.name, exact: true }).first().waitFor()
        await settle()
        assert.equal(await page.getByText('Something went wrong', { exact: true }).count(), 0, tool.id + ' crashed')
        const overflow = await page.locator('#workspace').evaluate((workspace) => [...workspace.querySelectorAll('button,input,select,textarea,[role="tablist"]')].filter((element) => {
          const box = element.getBoundingClientRect(), style = getComputedStyle(element)
          return box.height > 0 && box.width > 0 && box.bottom > 48 && box.top < innerHeight && style.visibility !== 'hidden' && (box.left < -1 || box.right > innerWidth + 1)
        }).map((element) => element.getAttribute('aria-label') || element.textContent?.trim().slice(0, 80) || element.tagName))
        report.views.push({ theme, viewport: viewport.width, tool: tool.id, overflow })
        assert.deepEqual(overflow, [], `${theme} ${viewport.width}px ${tool.id} controls overflow`)
        if (viewport.width === 720 && ['json.studio', 'network.mock-api', 'text.ocr', 'network.http', 'design.color', 'privatebox.home'].includes(tool.id)) await screenshot('ux-' + tool.id.replace('.', '-') + '-' + theme + '-720')
      }
    }
    console.log(`PASS ${theme}: ${catalogue.length} routes at 1180×760 and 720×500; semantic contrast, button fills, input boundaries and native theme controls`)
    await page.setViewportSize({ width: 1180, height: 760 })
  }
  assert.deepEqual(errors, [], 'Catalogue page errors')
  const native = await browser.newPage({ viewport: { width: 1180, height: 760 } })
  await native.addInitScript(() => {
    const state = window.__windowUi = { maximized: false, calls: [] }
    window.devutils = {
      platform: async () => 'win32',
      app: { onOpenTool: () => () => {} },
      window: { isMaximized: async () => state.maximized, maximize: async () => { state.calls.push('maximize'); state.maximized = !state.maximized }, minimize: async () => { state.calls.push('minimize') }, close: async () => { state.calls.push('close') } }
    }
  })
  await native.goto(url + '/#/tool/json.studio')
  await native.getByRole('heading', { name: 'JSON Studio', exact: true }).waitFor()
  await native.getByRole('button', { name: 'Maximize', exact: true }).click()
  await native.getByRole('button', { name: 'Restore window', exact: true }).waitFor()
  await native.getByRole('button', { name: 'Restore window', exact: true }).click()
  await native.getByRole('button', { name: 'Maximize', exact: true }).waitFor()
  await native.getByRole('button', { name: 'Minimize', exact: true }).click()
  assert.deepEqual(await native.evaluate(() => window.__windowUi.calls), ['maximize', 'maximize', 'minimize'])
  await native.getByRole('button', { name: 'Pin JSON Studio', exact: true }).click()
  await native.getByRole('button', { name: 'Unpin JSON Studio', exact: true }).waitFor()
  await native.getByRole('link', { name: 'All tools', exact: true }).click()
  await native.getByRole('heading', { name: 'Favorites', exact: true }).waitFor()
  assert.equal(await native.evaluate(() => JSON.parse(localStorage.getItem('devutils-app')).state.favoriteToolIds[0]), 'json.studio')
  console.log('PASS window action labels and tool-header favorite round-trip')
  await native.close()
  if (process.env.BRAND_SCREENSHOT_DIR) await writeFile(join(process.env.BRAND_SCREENSHOT_DIR, 'ux-review-results.json'), JSON.stringify(report, null, 2))
} catch (error) {
  await screenshot('ux-review-failure').catch(() => {})
  throw error
} finally {
  await browser.close()
  await new Promise((done) => server.close(done))
}