import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve, extname, sep, join } from 'node:path'
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
// Run after the production build with an available Playwright installation.
// PLAYWRIGHT_MODULE optionally points to its module URL; UX_BROWSER_CHANNEL
// optionally selects an installed browser (e.g. msedge). No repo dependency
// installation is required. All vault operations below use an in-memory fixture.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = resolve('out/renderer')
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }
const server = createServer(async (req, res) => {
  try {
    const path = resolve(root, `.${new URL(req.url, 'http://localhost').pathname === '/' ? '/index.html' : new URL(req.url, 'http://localhost').pathname}`)
    if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return }
    const bytes = await readFile(path)
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' }); res.end(bytes)
  } catch { res.writeHead(404).end() }
})
const browser = await chromium.launch({ channel: process.env.UX_BROWSER_CHANNEL || undefined, headless: true })
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const url = `http://127.0.0.1:${server.address().port}`
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } })
page.setDefaultTimeout(10000)
const errors = []
page.on('pageerror', error => errors.push(error.message))
page.on('console', msg => { if (msg.type() === 'error') console.log('BROWSER', msg.text().slice(0, 220)) })
await page.addInitScript(() => {
  // Test-only bridge: no native file, vault or user data is accessed.
  const state = window.__ux = { saved: [], failNextSave: false, delaySave: false, finishSave: null, signouts: 0, listCalls: 0, quickOpen: null, picked: null, failPick: false, pickResult: { hex: '#00FF88' } }
  const note = { title: 'Fixture note', body: 'Original body', color: 'default', pinned: false, updatedAt: '2026-10-05T00:00:00Z' }
  let content = JSON.stringify(note)
  const doc = () => ({ id: 'keep/fixture.putl', name: 'Fixture note.keep.json', type: 'keep-note', relativePath: 'keep/fixture.putl', sessionId: 'fixture-session', content })
  const save = async () => {
    if (state.failNextSave) { state.failNextSave = false; throw new Error('Fixture save failure') }
    if (state.delaySave) await new Promise(resolve => { state.finishSave = resolve })
  }
  window.devutils = {
    platform: async () => 'win32',
    window: { close() {}, minimize() {}, maximize() {} },
    app: {
      trayAvailable: async () => true, quit: async () => {},
      onOpenTool: callback => { state.quickOpen = callback; return () => { state.quickOpen = null } }
    },
    color: {
      lastScreen: async () => null,
      pickScreen: async () => { if (state.failPick) throw new Error('Fixture picker unavailable'); return state.pickResult },
      onPicked: callback => { state.picked = callback; return () => { state.picked = null } }
    },
    privateBox: {
      ensureDefault: async () => ({ id: 'fixture-box' }),
      prepareDefaultForSave: async () => ({ boxId: 'fixture-box', hasAccess: true, sessionId: 'fixture-session' }),
      clearAccess: async () => { state.signouts++ },
      mkdir: async () => {},
      list: async () => [{ kind: 'file', type: 'keep-note', name: 'Fixture note.keep.json', relativePath: 'keep/fixture.putl' }],
      listKeepNotes: async token => { if (token !== 'fixture-session') throw new Error('SESSION_CHANGED'); state.listCalls++; return { notes: [doc()], unreadable: [], nextCursor: null } },
      readFile: async () => doc(),
      writeFile: async (path, text, token) => { if (token !== 'fixture-session') throw new Error('SESSION_CHANGED'); await save(); content = text; state.saved.push(text); return doc() },
      saveDocument: async (payload, token) => { if (token !== 'fixture-session') throw new Error('SESSION_CHANGED'); await save(); state.saved.push(payload.content); return { doc: { ...doc(), id: 'keep/new.putl', relativePath: 'keep/new.putl', content: payload.content } } }
    }
  }
})
const waitKeep = async () => {
  await page.goto(url + '/#/tool/privatebox.keep')
  await page.reload()
  await page.getByRole('button', { name: 'Take a note…' }).waitFor()
}
const newNote = async text => {
  await page.getByRole('button', { name: 'Take a note…' }).click()
  await page.getByRole('textbox', { name: 'Note body' }).fill(text)
}
const guard = () => page.getByRole('dialog', { name: 'Unsaved changes' })
try {
  await page.goto(url + '/#/')
  await page.getByRole('heading', { name: 'DevFusion', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Color Picker', exact: true }).first().waitFor()
  if (process.env.BRAND_SCREENSHOT_DIR) {
    await mkdir(process.env.BRAND_SCREENSHOT_DIR, { recursive: true })
    await page.screenshot({ path: join(process.env.BRAND_SCREENSHOT_DIR, 'devfusion-home.png') })
  }
  console.log('PASS DevFusion branding and quick-access Home')
  await waitKeep()
  await newNote('Unsaved fixture text')
  await page.evaluate(() => window.__ux.quickOpen('json.studio'))
  await guard().waitFor()
  assert.match(page.url(), /privatebox.keep/)
  await guard().getByRole('button', { name: 'Keep editing' }).click()
  assert.equal(await page.getByRole('textbox', { name: 'Note body' }).inputValue(), 'Unsaved fixture text')
  console.log('PASS tray route message honors Keep draft guard')
  await page.getByRole('link', { name: 'JSON Studio', exact: true }).click()
  await guard().waitFor()
  assert.match(page.url(), /privatebox.keep/)
  await guard().getByRole('button', { name: 'Keep editing' }).click()
  assert.equal(await page.getByRole('textbox', { name: 'Note body' }).inputValue(), 'Unsaved fixture text')
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('devutils-app')).state.lastToolId), 'privatebox.keep')
  await page.getByRole('link', { name: 'JSON Studio', exact: true }).click()
  await page.evaluate(() => window.__ux.failNextSave = true)
  await guard().getByRole('button', { name: 'Save and continue' }).click()
  await guard().getByRole('alert').waitFor()
  assert.match(page.url(), /privatebox.keep/)
  await guard().getByRole('button', { name: 'Keep editing' }).click()
  assert.equal(await page.getByRole('textbox', { name: 'Note body' }).inputValue(), 'Unsaved fixture text')
  await page.getByRole('link', { name: 'JSON Studio', exact: true }).click()
  await guard().getByRole('button', { name: 'Save and continue' }).click()
  await page.getByRole('heading', { name: 'JSON Studio', exact: true }).waitFor()
  assert.equal(await page.evaluate(() => JSON.parse(window.__ux.saved[0]).body), 'Unsaved fixture text')
  console.log('PASS sidebar navigation, failed save draft retention, retry then navigation')

  await waitKeep()
  await newNote('Busy write fixture')
  await page.evaluate(() => window.__ux.delaySave = true)
  await page.getByRole('link', { name: 'JSON Studio', exact: true }).click()
  await guard().getByRole('button', { name: 'Save and continue' }).click()
  assert.equal(await page.getByRole('dialog').getByRole('button', { name: 'Keep editing' }).isDisabled(), true)
  await page.keyboard.press('Escape')
  assert.equal(await page.getByRole('dialog').count(), 1)
  await page.evaluate(() => { window.__ux.delaySave = false; window.__ux.finishSave() })
  await page.getByRole('heading', { name: 'JSON Studio', exact: true }).waitFor()
  console.log('PASS active write disables discard/cancel/Escape')

  await waitKeep()
  await newNote('Discard fixture')
  const before = await page.evaluate(() => window.__ux.saved.length)
  await page.getByRole('button', { name: 'Sign out of box' }).click()
  await guard().getByRole('button', { name: 'Discard changes' }).click()
  await page.getByRole('textbox', { name: 'Keep password' }).waitFor()
  assert.equal(await page.evaluate(() => window.__ux.saved.length), before)
  console.log('PASS explicit discard and sign out')

  await waitKeep()
  await newNote('Save before sign out')
  await page.getByRole('button', { name: 'Sign out of box' }).click()
  await guard().getByRole('button', { name: 'Save and continue' }).click()
  await page.getByRole('textbox', { name: 'Keep password' }).waitFor()
  assert.equal(await page.evaluate(() => JSON.parse(window.__ux.saved.at(-1)).body), 'Save before sign out')
  console.log('PASS save before sign out')

  await waitKeep()
  console.log('STEP open existing note')
  await page.getByRole('button', { name: 'Fixture note Original body' }).click()
  const editor = page.getByRole('dialog', { name: 'Edit note' })
  await editor.waitFor()
  console.log('STEP edit existing note')
  await editor.getByRole('textbox', { name: 'Note body' }).fill('Edited fixture body')
  const listsBeforeSave = await page.evaluate(() => window.__ux.listCalls)
  await editor.getByRole('button', { name: 'Close', exact: true }).click()
  await guard().waitFor()
  console.log('STEP dismiss nested guard')
  await guard().getByRole('button', { name: 'Keep editing' }).click()
  assert.equal(await editor.getByRole('textbox', { name: 'Note body' }).inputValue(), 'Edited fixture body')
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab')
    assert.equal(await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]')), true)
  }
  await page.keyboard.press('Escape')
  console.log('STEP save existing note')
  await guard().getByRole('button', { name: 'Save and continue' }).click()
  await editor.waitFor({ state: 'hidden' })
  assert.equal(await page.evaluate(() => JSON.parse(window.__ux.saved.at(-1)).body), 'Edited fixture body')
  assert.equal(await page.evaluate(() => window.__ux.listCalls), listsBeforeSave)
  console.log('PASS edit close guard, nested dialog focus containment and save bridge payload')

  await page.getByRole('link', { name: 'YAML Studio', exact: true }).click()
  await page.getByText('Valid YAML', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'JSON', exact: true }).click()
  await page.getByText('"DevFusion"', { exact: false }).first().waitFor()
  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await page.getByText('Paste YAML to get started', { exact: true }).waitFor()
  console.log('PASS production YAML worker and stale-output clearing')

  await page.getByRole('link', { name: 'Color Picker', exact: true }).click()
  await page.getByRole('heading', { name: 'Color Picker', exact: true }).waitFor()
  await page.getByLabel('HEX color', { exact: true }).fill('#f80')
  assert.equal(await page.getByLabel('RGB value', { exact: true }).inputValue(), 'rgb(255, 136, 0)')
  await page.getByLabel('HEX color', { exact: true }).fill('#oops')
  await page.getByRole('alert').filter({ hasText: 'Enter 3 or 6' }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Copy HEX', exact: true }).isDisabled(), true)
  await page.getByLabel('HEX color', { exact: true }).fill('#336699')
  await page.getByRole('button', { name: 'Pick screen color', exact: true }).click()
  await page.getByRole('status').filter({ hasText: '#00FF88 selected.' }).waitFor()
  assert.equal(await page.getByLabel('HEX color', { exact: true }).inputValue(), '#00FF88')
  await page.evaluate(() => { window.__ux.pickResult = null })
  await page.getByRole('button', { name: 'Pick screen color', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Color picking canceled' }).waitFor()
  assert.equal(await page.getByLabel('HEX color', { exact: true }).inputValue(), '#00FF88')
  await page.evaluate(() => { window.__ux.failPick = true })
  await page.getByRole('button', { name: 'Pick screen color', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Fixture picker unavailable' }).waitFor()
  await page.evaluate(() => { window.__ux.failPick = false; window.__ux.picked('#112233') })
  assert.equal(await page.getByLabel('HEX color', { exact: true }).inputValue(), '#112233')
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('Fixture clipboard denied')) } }))
  await page.getByRole('button', { name: 'Copy RGB', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Clipboard copy failed' }).waitFor()
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.resolve() } }))
  await page.getByRole('button', { name: 'Copy RGB', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'rgb(17, 34, 51) copied.' }).waitFor()
  if (process.env.BRAND_SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.BRAND_SCREENSHOT_DIR, 'devfusion-color-picker.png') })
  console.log('PASS Color Picker conversion, validation, pick/cancel/error, tray event and clipboard retry')

  await page.getByRole('button', { name: 'Switch to light', exact: true }).click()
  await page.setViewportSize({ width: 720, height: 600 })
  await page.getByRole('button', { name: 'Pick screen color', exact: true }).waitFor()
  await page.getByLabel('HEX color', { exact: true }).scrollIntoViewIfNeeded()
  for (const label of ['HEX color', 'HEX value', 'RGB value', 'HSL value', 'HSV value']) {
    const bounds = await page.getByLabel(label, { exact: true }).boundingBox()
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 720, label + ' overflows the narrow desktop viewport')
  }
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Color Picker creates horizontal page overflow')
  if (process.env.BRAND_SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.BRAND_SCREENSHOT_DIR, 'devfusion-color-picker-light-720.png') })
  await page.getByRole('button', { name: 'Switch to dark', exact: true }).click()
  await page.setViewportSize({ width: 1100, height: 760 })
  console.log('PASS Color Picker light theme and narrow desktop input bounds')

  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByRole('group', { name: 'Theme', exact: true }).waitFor()
  const theme = page.getByRole('group', { name: 'Theme', exact: true })
  await theme.getByRole('button', { name: 'Dark', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  assert.equal(await theme.getByRole('button', { name: 'Light', exact: true }).getAttribute('aria-pressed'), 'true')
  await page.keyboard.press('End')
  assert.equal(await theme.getByRole('button', { name: 'System', exact: true }).getAttribute('aria-pressed'), 'true')
  await page.keyboard.press('Home')
  assert.equal(await theme.getByRole('button', { name: 'Dark', exact: true }).getAttribute('tabindex'), '0')
  assert.equal(await theme.getByRole('button', { name: 'Light', exact: true }).getAttribute('tabindex'), '-1')
  console.log('PASS segmented arrows, Home/End and single keyboard tab stop')

  await waitKeep()
  await newNote('Async failure draft')
  await page.evaluate(() => window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', { promise: Promise.resolve(), reason: new Error('fixture failure') })))
  await page.getByRole('alert').filter({ hasText: 'An action failed' }).waitFor()
  assert.match(page.url(), /privatebox.keep/)
  assert.equal(await page.getByRole('textbox', { name: 'Note body' }).inputValue(), 'Async failure draft')
  await page.getByRole('button', { name: 'Dismiss', exact: true }).click()
  console.log('PASS async failure preserves route and draft')

  await page.setViewportSize({ width: 720, height: 600 })
  await page.getByRole('button', { name: 'Sign out of box' }).click()
  await guard().waitFor()
  const box = await guard().boundingBox()
  assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 720 && box.y + box.height <= 600)
  await page.screenshot({ path: join(tmpdir(), 'devutils-ux-guard.png') })
  await guard().getByRole('button', { name: 'Keep editing' }).click()
  await page.getByRole('button', { name: 'Close', exact: true }).last().click()
  await guard().getByRole('button', { name: 'Discard changes' }).click()
  console.log('PASS 720x600 dialog bounds')

  await page.setViewportSize({ width: 1100, height: 760 })
  await page.getByRole('link', { name: 'JSON Studio', exact: true }).click()
  await page.getByRole('heading', { name: 'JSON Studio', exact: true }).waitFor()
  await page.getByRole('link', { name: 'Keep', exact: true }).click()
  await page.getByRole('button', { name: 'Take a note…' }).waitFor()
  await newNote('Back navigation fixture')
  assert.equal(await page.evaluate(() => !window.dispatchEvent(new Event('beforeunload', { cancelable: true }))), true)
  await page.goBack()
  await guard().waitFor()
  await guard().getByRole('button', { name: 'Keep editing' }).click()
  assert.match(page.url(), /privatebox.keep/)
  assert.equal(await page.getByRole('textbox', { name: 'Note body' }).inputValue(), 'Back navigation fixture')
  await page.keyboard.press('Control+k')
  await page.getByPlaceholder('Search tools…', { exact: true }).fill('JSON Studio')
  await page.keyboard.press('Enter')
  await guard().waitFor()
  await guard().getByRole('button', { name: 'Discard changes' }).click()
  await page.getByRole('heading', { name: 'JSON Studio', exact: true }).waitFor()
  console.log('PASS Back, beforeunload and command palette use the same draft guard')

  await page.getByRole('button', { name: 'Collapse root', exact: true }).waitFor()
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('Fixture clipboard denied')) } }))
  await page.locator('button[title^="Copy path:"]').first().click()
  await page.getByRole('status').filter({ hasText: 'Copy failed.' }).waitFor()
  assert.equal(await page.getByRole('alert').filter({ hasText: 'An action failed' }).count(), 0)
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.resolve() } }))
  await page.locator('button[title^="Copy path:"]').first().click()
  await page.getByRole('status').filter({ hasText: 'Path copied' }).waitFor()
  console.log('PASS tree labels and handled clipboard failure/retry')
  await page.route('**/assets/KeepApp-*.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export default function FixtureCrash(){throw new Error("Fixture render error")}' }))
  await page.goto(url + '/#/tool/privatebox.keep')
  await page.reload()
  await page.getByRole('heading', { name: 'Something went wrong' }).waitFor()
  await new Promise(resolve => setTimeout(resolve, 5500))
  assert.match(page.url(), /privatebox.keep/)
  assert.equal(await page.getByRole('heading', { name: 'Something went wrong' }).count(), 1)
  await page.getByRole('button', { name: 'Back to Home' }).click()
  await page.getByRole('heading', { name: 'DevFusion', exact: true }).waitFor()
  console.log('PASS render failure remains visible beyond the old auto-redirect timer; Home is explicit')
  const preview = await browser.newPage({ viewport: { width: 720, height: 600 } })
  await preview.goto(url + '/#/tool/privatebox.keep')
  await preview.getByRole('textbox', { name: 'Keep password' }).waitFor()
  assert.equal(await preview.getByRole('textbox', { name: 'Keep password' }).isDisabled(), true)
  await preview.getByRole('alert').filter({ hasText: 'Keep requires the desktop app.' }).waitFor()
  await preview.close()
  console.log('PASS browser preview retains the honest desktop-required state')
  assert.deepEqual(errors.filter(message => message !== 'Fixture render error'), [])
} catch (error) {
  console.error('SMOKE FAILED', error.message)
  await page.screenshot({ path: join(tmpdir(), 'devutils-ux-failure.png'), timeout: 5000 }).catch(() => {})
  throw error
} finally {
  const serverClosed = new Promise(resolve => server.close(resolve))
  server.closeAllConnections()
  await browser.close()
  await serverClosed
}
