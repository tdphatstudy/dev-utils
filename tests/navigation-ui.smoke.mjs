import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import assert from 'node:assert/strict'

// Production renderer, isolated browser profile, test-only bridge and storage.
// Run after pnpm build, using the same Playwright variables as other UI smokes.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = resolve('out/renderer')
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname
    const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname))
    if (!path.startsWith(root + sep)) { response.writeHead(403).end(); return }
    response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' })
    response.end(await readFile(path))
  } catch { response.writeHead(404).end() }
})
const browser = await chromium.launch({ channel: process.env.UX_BROWSER_CHANNEL || undefined, headless: true })
await new Promise((done) => server.listen(0, '127.0.0.1', done))
const url = `http://127.0.0.1:${server.address().port}`
const page = await browser.newPage({ viewport: { width: 1180, height: 800 } })
page.setDefaultTimeout(10000)
const errors = [], requests = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('request', (request) => requests.push(request.url()))
await page.addInitScript(() => {
  window.devutils = {
    platform: async () => 'win32',
    window: { close() {}, minimize() {}, maximize() {} },
    app: { trayAvailable: async () => true, quit: async () => {}, onOpenTool: () => () => {} },
    privateBox: { ensureDefault: async () => ({ id: 'fixture' }) }
  }
})
const palette = () => page.getByRole('dialog', { name: 'Search tools', exact: true })
const drawer = () => page.getByRole('dialog', { name: 'Find a tool', exact: true })
try {
  await page.goto(url + '/#/')
  await page.getByRole('heading', { name: 'DevFusion', exact: true }).waitFor()
  const homeSearch = page.getByRole('searchbox', { name: 'Find a tool', exact: true })
  const searchBounds = await homeSearch.boundingBox()
  const quickBounds = await page.getByRole('heading', { name: 'Quick access', exact: true }).boundingBox()
  assert.ok(searchBounds.y < quickBounds.y, 'Search is not before quick access')
  assert.ok(!requests.some((request) => /\/assets\/(?:JsonStudio|OcrTool|MockApiTool|TimestampTool)-/.test(request)), 'Home eagerly loaded tool UIs')
  await page.getByRole('button', { name: 'Add JSON Studio to favorites', exact: true }).first().click()
  await page.getByRole('heading', { name: 'Favorites', exact: true }).waitFor()
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('devutils-app')).state.favoriteToolIds), ['json.studio'])
  await page.reload()
  await page.getByRole('heading', { name: 'Favorites', exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Remove JSON Studio from favorites', exact: true }).first().getAttribute('aria-pressed'), 'true')
  console.log('PASS search-first Home, lazy tool imports and ID-only favorites across reload')

  await page.getByLabel('Category', { exact: true }).selectOption('time')
  const browse = page.locator('section[aria-labelledby="home-browse"]')
  assert.equal(await browse.getByRole('button', { name: 'JSON Studio', exact: true }).count(), 0)
  await browse.getByRole('button', { name: 'Timestamp Converter', exact: true }).waitFor()
  await homeSearch.fill('no-matching-fixture')
  await page.getByRole('heading', { name: 'No tools found', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Clear search and filters', exact: true }).click()
  assert.equal(await page.getByLabel('Category', { exact: true }).inputValue(), 'all')
  assert.equal(await homeSearch.inputValue(), '')
  await homeSearch.fill('JSON Studio')
  await homeSearch.press('Enter')
  await page.getByRole('heading', { name: 'JSON Studio', exact: true }).waitFor()
  console.log('PASS category filter, search empty-state recovery and Enter navigation')

  const sidebar = page.getByRole('complementary', { name: 'Sidebar', exact: true })
  const jsonGroup = sidebar.locator('button[aria-controls="sidebar-rail-group-json"]')
  await jsonGroup.click()
  assert.equal(await jsonGroup.getAttribute('aria-expanded'), 'false')
  await sidebar.getByText('Current tool', { exact: true }).waitFor()
  assert.equal(await page.getByRole('link', { name: 'JSON Studio', exact: true }).count(), 1)
  const sidebarFilter = page.getByRole('searchbox', { name: 'Filter sidebar tools', exact: true })
  await sidebarFilter.fill('timestamp')
  assert.equal(await page.getByRole('link', { name: 'JSON Studio', exact: true }).count(), 1)
  await page.getByRole('link', { name: 'Timestamp Converter', exact: true }).click()
  await page.getByRole('heading', { name: 'Timestamp Converter', exact: true }).waitFor()
  assert.equal(await sidebarFilter.inputValue(), '')
  assert.equal(await sidebar.locator('button[aria-controls="sidebar-rail-group-time"]').getAttribute('aria-expanded'), 'true')
  console.log('PASS sidebar category collapse, active tool visibility and route-revealing filter')

  await page.keyboard.press('Control+k')
  await palette().waitFor()
  await palette().getByRole('combobox', { name: 'Search tools', exact: true }).waitFor()
  assert.equal(await palette().getByRole('option', { name: 'JSON Studio', exact: true }).count(), 1)
  assert.equal(await palette().getByRole('option', { name: 'Timestamp Converter', exact: true }).count(), 1)
  await palette().getByRole('combobox', { name: 'Search tools', exact: true }).fill('Lorem Text')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.getByRole('heading', { name: 'Lorem Text', exact: true }).waitFor()
  await page.keyboard.press('Control+k')
  await palette().getByRole('combobox', { name: 'Search tools', exact: true }).fill('no-matching-fixture')
  await palette().getByText('No tools found', { exact: true }).waitFor()
  await palette().getByRole('button', { name: 'Close tool search', exact: true }).click()
  await palette().waitFor({ state: 'hidden' })
  console.log('PASS keyboard palette, unique options and visible empty/close controls')

  await page.setViewportSize({ width: 720, height: 600 })
  const openMenu = page.getByRole('button', { name: 'Open menu', exact: true })
  await openMenu.click()
  await drawer().waitFor()
  const narrowFilter = drawer().getByRole('searchbox', { name: 'Filter sidebar tools', exact: true })
  assert.equal(await narrowFilter.evaluate((element) => element === document.activeElement), true)
  assert.equal(await page.getByRole('link', { name: 'Lorem Text', exact: true }).count(), 1, 'Drawer exposes duplicate background links')
  for (let index = 0; index < 65; index++) {
    await page.keyboard.press('Tab')
    assert.equal(await page.evaluate(() => Boolean(document.activeElement.closest('[role="dialog"]'))), true, 'Tab escaped navigation drawer')
  }
  for (let index = 0; index < 5; index++) {
    await page.keyboard.press('Shift+Tab')
    assert.equal(await page.evaluate(() => Boolean(document.activeElement.closest('[role="dialog"]'))), true)
  }
  await narrowFilter.fill('timestamp')
  await page.keyboard.press('Escape')
  await drawer().waitFor()
  assert.equal(await narrowFilter.inputValue(), '')
  await page.keyboard.press('Escape')
  await drawer().waitFor({ state: 'hidden' })
  assert.equal(await openMenu.evaluate((element) => element === document.activeElement), true)
  await openMenu.click()
  await drawer().waitFor()
  await page.mouse.click(680, 300)
  await drawer().waitFor({ state: 'hidden' })
  assert.equal(await openMenu.evaluate((element) => element === document.activeElement), true)
  await openMenu.click()
  const drawerJson = drawer().locator('button[aria-controls="sidebar-drawer-group-json"]')
  if (await drawerJson.getAttribute('aria-expanded') === 'false') await drawerJson.click()
  await drawer().getByRole('link', { name: 'JSON Studio', exact: true }).click()
  await page.getByRole('heading', { name: 'JSON Studio', exact: true }).waitFor()
  await drawer().waitFor({ state: 'hidden' })
  const widths = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }))
  assert.ok(widths.document <= widths.viewport)
  console.log('PASS narrow drawer modal focus, hidden background, filter Escape, dismiss and route navigation')
  assert.deepEqual(errors, [])
} finally {
  await browser.close()
  await new Promise((done) => server.close(done))
}
