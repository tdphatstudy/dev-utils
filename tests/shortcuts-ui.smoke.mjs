import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve, extname, sep, join } from 'node:path'
import assert from 'node:assert/strict'

// Real production renderer, isolated preferences and mocked named desktop APIs.
// No user vault, network target, clipboard or screen capture is accessed.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = resolve('out/renderer')
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }
const server = createServer(async (request, response) => {
  try {
    const path = resolve(root, '.' + new URL(request.url, 'http://localhost').pathname)
    if (!path.startsWith(root + sep)) { response.writeHead(403).end(); return }
    response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' }).end(await readFile(path))
  } catch { response.writeHead(404).end() }
})
await new Promise(done => server.listen(0, '127.0.0.1', done))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ channel: process.env.UX_BROWSER_CHANNEL || undefined, headless: true })
const page = await browser.newPage({ viewport: { width: 1180, height: 800 } })
page.setDefaultTimeout(10000)
const errors = [], external = []
page.on('pageerror', error => errors.push(error.message))
await page.route('**/*', route => {
  if (new URL(route.request().url()).origin === origin) return route.continue()
  external.push(route.request().url()); return route.abort()
})
await page.addInitScript(() => {
  const calls = window.__shortcutFixture = { http: [], captures: [], picks: 0, locks: 0 }
  window.devutils = {
    platform: async () => 'win32',
    window: { close() {}, minimize() {}, maximize() {}, isMaximized: async () => false },
    app: { trayAvailable: async () => true, onOpenTool: () => () => {} },
    security: { state: async () => ({ idleMinutes: 15 }), onVaultLocked: () => () => {}, lock: async () => { calls.locks++ } },
    color: { lastScreen: async () => null, onPicked: () => () => {}, pickScreen: async () => { calls.picks++; return null } },
    ocr: { onProgress: () => () => {}, cancel: async () => {}, capture: async value => { calls.captures.push(value); return { text: 'Fixture text', pages: 1, ocrPages: 1 } } },
    net: { cancelHttpRequest: async () => {}, httpRequest: async payload => {
      calls.http.push(payload)
      return { status: 200, statusText: 'OK', ok: true, headers: {}, bodyText: '{"fixture":true}', bodyEncoding: 'utf8', size: 16, timeMs: 1, finalUrl: payload.url }
    } }
  }
})
const row = id => page.locator(`[data-shortcut-id="${id}"]`)
const manager = () => page.locator('#shortcuts')
const dialog = () => page.getByRole('dialog')
const combo = () => dialog().getByRole('textbox', { name: 'Shortcut combination', exact: true })
const save = () => dialog().getByRole('button', { name: 'Save shortcut', exact: true })
const overrides = () => page.evaluate(() => JSON.parse(localStorage.getItem('devutils-app')).state.shortcutOverrides)
const open = async id => {
  await page.goto(`${origin}/index.html#/tool/${id}`)
  await page.locator(`[data-tool-ready="${id}"]`).waitFor()
}
const edit = async (id, binding) => {
  await row(id).getByRole('button').first().click()
  await combo().fill(binding)
}
const assign = async (id, binding) => {
  await edit(id, binding)
  assert.equal(await save().isEnabled(), true, `Cannot assign ${id} to ${binding}`)
  await save().click()
  await dialog().waitFor({ state: 'hidden' })
}
const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))

try {
  await page.goto(`${origin}/index.html#/`)
  await page.keyboard.press('Control+,')
  await manager().waitFor()
  assert.ok(await manager().locator('li[data-shortcut-id]').count() > 60, 'All registered tools and contextual actions should be listed')
  assert.match(await row('app.palette').innerText(), /Ctrl\+K/)
  assert.match(await row('tool.json.studio').innerText(), /Ctrl\+Shift\+1/)

  await manager().getByRole('button', { name: 'Check a shortcut', exact: true }).click()
  await dialog().getByRole('textbox', { name: 'Press shortcut keys', exact: true }).press('Control+k')
  assert.equal(await page.getByRole('dialog', { name: 'Search tools', exact: true }).count(), 0, 'Recording executed an existing action')
  assert.match(await dialog().innerText(), /Open command palette/)
  await combo().fill('Enter')
  assert.match(await dialog().innerText(), /Open selected box entry/)
  assert.equal(await dialog().getByRole('alert').count(), 0, 'Checker mislabeled a valid contextual key')
  await page.keyboard.press('Escape')
  await dialog().waitFor({ state: 'hidden' })
  assert.deepEqual(await overrides(), {})
  console.log('PASS complete catalogue, default app/tool shortcuts, keyboard recording and read-only conflict checker')

  await row('app.palette').getByRole('button').first().click()
  await dialog().getByRole('textbox', { name: 'Press shortcut keys', exact: true }).press('Control+Shift+p')
  assert.equal(await combo().inputValue(), 'Mod+Shift+P')
  await save().click()
  await dialog().waitFor({ state: 'hidden' })
  await page.keyboard.press('Control+k'); await settle()
  assert.equal(await page.getByRole('dialog').count(), 0, 'Previous binding still executes')
  await page.keyboard.press('Control+Shift+p')
  await page.getByRole('dialog', { name: 'Search tools', exact: true }).waitFor()
  await page.keyboard.press('Escape')
  await dialog().waitFor({ state: 'hidden' })
  await edit('app.home', 'Ctrl+Shift+P')
  assert.equal(await save().isDisabled(), true)
  assert.match(await dialog().getByRole('alert').innerText(), /overlapping context.*Open command palette/)
  await combo().fill('Mod+C')
  assert.equal(await save().isDisabled(), true)
  assert.match(await dialog().getByRole('alert').innerText(), /reserved/)
  await combo().fill('K')
  assert.equal(await save().isDisabled(), true)
  assert.match(await dialog().getByRole('alert').innerText(), /Include Ctrl/)
  await page.keyboard.press('Escape')
  await dialog().waitFor({ state: 'hidden' })

  await assign('app.home', 'Mod+K')
  await row('app.palette').getByRole('button').last().click()
  assert.equal((await overrides())['app.palette'], 'Mod+Shift+P', 'Reset introduced a conflict with a customized command')
  assert.match(await manager().getByRole('status').innerText(), /overlapping context/)
  await row('app.home').getByRole('button').last().click()
  await assign('tool.network.dns', 'Ctrl+Alt+D')
  await page.keyboard.press('Control+Alt+d')
  await page.locator('[data-tool-ready="network.dns"]').waitFor()
  await page.keyboard.press('Control+,')
  await manager().waitFor()
  assert.match(await row('tool.network.dns').innerText(), /Ctrl\+Alt\+D/)
  await page.reload(); await manager().waitFor()
  assert.equal((await overrides())['tool.network.dns'], 'Ctrl+Alt+D')
  console.log('PASS immediate rebinding, alias/reserved/typing checks, safe reset, tool navigation and persistence')

  await assign('editor.run', 'Mod+Alt+Enter')
  await open('json.studio')
  const input = page.getByRole('textbox', { name: 'JSON input', exact: true })
  await input.fill('{"a":1}')
  assert.equal(await input.getAttribute('aria-keyshortcuts'), 'Control+Alt+Enter')
  await input.press('Control+Alt+Enter')
  await page.waitForFunction(() => document.querySelector('[aria-label="JSON input"]').textContent.includes('"a": 1'))
  await open('network.http')
  await page.getByRole('textbox', { name: 'HTTP request URL', exact: true }).fill('https://fixture.example.test/private-path')
  await page.keyboard.press('Control+Enter'); await settle()
  assert.equal(await page.evaluate(() => window.__shortcutFixture.http.length), 0)
  await page.keyboard.press('Control+Alt+Enter')
  await page.waitForFunction(() => window.__shortcutFixture.http.length === 1)
  await page.getByRole('combobox', { name: 'HTTP method', exact: true }).selectOption('POST')
  await page.getByRole('textbox', { name: 'HTTP request body', exact: true }).press('Control+Alt+Enter')
  await page.waitForFunction(() => window.__shortcutFixture.http.length === 2)
  await settle()
  assert.equal(await page.evaluate(() => window.__shortcutFixture.http.length), 2, 'Editor and tool listener sent twice')
  console.log('PASS configured CodeMirror run, HTTP URL/body handling and no duplicate requests')

  await open('app.settings')
  await assign('ocr.region', 'Mod+Shift+C') // Separate Color/OCR contexts may reuse keys.
  await assign('ocr.screen', 'Mod+Alt+8')
  await open('design.color')
  await page.keyboard.press('Control+Shift+c')
  await page.waitForFunction(() => window.__shortcutFixture.picks === 1)
  assert.equal(await page.evaluate(() => window.__shortcutFixture.captures.length), 0)
  await open('text.ocr')
  await page.keyboard.press('Control+Shift+c')
  await page.waitForFunction(() => window.__shortcutFixture.captures.length === 1)
  assert.equal(await page.evaluate(() => window.__shortcutFixture.captures[0].mode), 'region')
  await page.keyboard.press('Control+Alt+8')
  await page.waitForFunction(() => window.__shortcutFixture.captures.length === 2)
  assert.equal(await page.evaluate(() => window.__shortcutFixture.captures[1].mode), 'screen')
  await page.keyboard.press('Control+Shift+x')
  await page.waitForFunction(() => window.__shortcutFixture.locks === 1)
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'X', code: 'KeyX', ctrlKey: true, shiftKey: true, repeat: true, bubbles: true })))
  await settle()
  assert.equal(await page.evaluate(() => window.__shortcutFixture.locks), 1)
  console.log('PASS context reuse, OCR region/screen, color picker, manual lock and repeat suppression')

  await open('app.settings')
  await edit('app.palette', 'Mod+Shift+P')
  await dialog().getByRole('button', { name: 'Disable shortcut', exact: true }).click()
  await dialog().waitFor({ state: 'hidden' })
  await page.keyboard.press('Control+Shift+p'); await settle()
  assert.equal(await dialog().count(), 0)
  assert.equal((await overrides())['app.palette'], null)
  await manager().getByRole('button', { name: 'Reset all shortcuts', exact: true }).click()
  await dialog().getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.equal((await overrides())['app.palette'], null)
  await manager().getByRole('button', { name: 'Reset all shortcuts', exact: true }).click()
  await dialog().getByRole('button', { name: 'Reset all shortcuts', exact: true }).click()
  assert.deepEqual(await overrides(), {})
  await page.keyboard.press('Control+k')
  await page.getByRole('dialog', { name: 'Search tools', exact: true }).waitFor()
  await page.keyboard.press('Escape')

  // Untrusted/corrupt preferences: report conflicts and suppress both actions.
  await page.evaluate(() => {
    const prefs = JSON.parse(localStorage.getItem('devutils-app'))
    prefs.state.shortcutOverrides = { 'app.home': 'Ctrl+K', 'app.theme': 'Ctrl+C' }
    localStorage.setItem('devutils-app', JSON.stringify(prefs))
  })
  await page.reload(); await manager().waitFor()
  await manager().getByRole('checkbox', { name: /Conflicts only/ }).check()
  assert.equal(await manager().locator('[data-shortcut-id]').count(), 3)
  await page.keyboard.press('Control+k'); await settle()
  assert.equal(await dialog().count(), 0)
  assert.match(page.url(), /app.settings$/)
  await manager().getByRole('button', { name: 'Reset all shortcuts', exact: true }).click()
  await dialog().getByRole('button', { name: 'Reset all shortcuts', exact: true }).click()
  await manager().getByRole('checkbox', { name: /Conflicts only/ }).uncheck()
  console.log('PASS disable, confirmed reset, corrupted-config conflict reporting and ambiguous-action suppression')

  for (const locale of ['en', 'vi', 'ar']) {
    await page.locator('[data-language-select]').selectOption(locale)
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => {
        const prefs = JSON.parse(localStorage.getItem('devutils-app')); prefs.state.theme = theme
        localStorage.setItem('devutils-app', JSON.stringify(prefs))
      }, theme)
      await page.reload(); await manager().waitFor()
      for (const width of [1180, 720]) {
        await page.setViewportSize({ width, height: 800 })
        await manager().scrollIntoViewIfNeeded()
        assert.equal(await manager().evaluate(element => element.scrollWidth <= element.clientWidth), true, `Overflow ${locale}/${theme}/${width}`)
        if (process.env.BRAND_SCREENSHOT_DIR) {
          await mkdir(process.env.BRAND_SCREENSHOT_DIR, { recursive: true })
          await page.screenshot({ path: join(process.env.BRAND_SCREENSHOT_DIR, `shortcuts-${locale}-${theme}-${width}.png`), animations: 'disabled' })
        }
      }
    }
  }
  assert.equal(await page.locator('html').getAttribute('dir'), 'rtl')
  assert.deepEqual(errors, [])
  assert.deepEqual(external, [])
  assert.ok(!JSON.stringify(await overrides()).includes('private-path'))
  console.log('PASS English/Vietnamese/RTL, light/dark, two widths, no renderer errors or external traffic')
} finally {
  await browser.close()
  await new Promise(done => server.close(done))
}
