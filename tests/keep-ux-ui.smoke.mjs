import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, extname, sep, join } from 'node:path'
import assert from 'node:assert/strict'

// Isolated production-renderer fixture. Notes, vault state and mutations exist
// only in memory. No user vault, clipboard, network service or native files.
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
const url = `http://127.0.0.1:${server.address().port}/index.html`
const browser = await chromium.launch({ channel: process.env.UX_BROWSER_CHANNEL || undefined, headless: true })
const page = await browser.newPage({ viewport: { width: 720, height: 500 } })
page.setDefaultTimeout(12000)
const errors = [], report = { baseline: !!process.env.KEEP_UX_BASELINE, contrast: [] }
let nativeDialogs = 0
page.on('pageerror', error => errors.push(error.message))
page.on('dialog', async dialog => { nativeDialogs++; await dialog.dismiss() })
await page.addInitScript(() => {
  const colors = ['default', 'coral', 'peach', 'sand', 'mint', 'sage', 'fog', 'dusk', 'blossom', 'clay']
  const state = window.__keepFixture = { failRemove: false, delayRemove: false, finishRemove: null, removes: [], saved: [], signouts: 0, locked: false, empty: false, session: 'fixture-session', quickOpen: null }
  const docs = colors.map((color, index) => ({ id: `fixture-${color}`, relativePath: `keep/${color}.putl`, name: `${color}.keep.json`, type: 'keep-note', sessionId: state.session,
    content: JSON.stringify({ title: index ? `${color} fixture` : 'Fixture note', body: index ? 'Color note body' : 'Original body', color, pinned: !index, updatedAt: '2026-10-05T00:00:00Z' }) }))
  docs.push({ ...docs[0], id: 'fixture-empty', relativePath: 'keep/empty.putl', content: JSON.stringify({ title: '', body: '', color: 'default', pinned: false }) })
  window.devutils = {
    platform: async () => 'win32',
    window: { close() {}, minimize() {}, maximize() {} },
    app: { trayAvailable: async () => true, onOpenTool: callback => { state.quickOpen = callback; return () => { state.quickOpen = null } } },
    privateBox: {
      ensureDefault: async () => ({ id: 'fixture-box' }),
      prepareDefaultForSave: async () => ({ boxId: 'fixture-box', hasAccess: !state.locked, sessionId: state.session }),
      accessDefault: async () => { state.locked = false; return state.session },
      clearAccess: async () => { state.signouts++; state.locked = true },
      mkdir: async () => {},
      listKeepNotes: async token => { if (token !== state.session) throw new Error('SESSION_CHANGED'); return { notes: state.empty ? [] : docs, unreadable: [], nextCursor: null } },
      writeFile: async (path, content, token) => { if (token !== state.session) throw new Error('SESSION_CHANGED'); const doc = docs.find(doc => doc.relativePath === path); doc.content = content; state.saved.push(content); return doc },
      saveDocument: async (payload, token) => { if (token !== state.session) throw new Error('SESSION_CHANGED'); const doc = { ...docs[0], id: 'fixture-new', relativePath: 'keep/new.putl', content: payload.content }; docs.push(doc); state.saved.push(payload.content); return { doc } },
      remove: async (path, token) => {
        state.removes.push({ path, token })
        if (state.delayRemove) await new Promise(done => { state.finishRemove = done })
        if (token !== state.session) throw new Error('SESSION_CHANGED')
        if (state.failRemove) { state.failRemove = false; throw new Error('Fixture delete denied') }
        const index = docs.findIndex(doc => doc.relativePath === path)
        if (index >= 0) docs.splice(index, 1)
      }
    }
  }
})
const screenshot = async name => {
  if (!process.env.BRAND_SCREENSHOT_DIR) return
  await mkdir(process.env.BRAND_SCREENSHOT_DIR, { recursive: true })
  await page.screenshot({ path: join(process.env.BRAND_SCREENSHOT_DIR, name + '.png'), animations: 'disabled' })
}
const luminance = rgb => rgb.map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0)
const ratio = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05)
const readContrast = async (locator, label, theme, pseudo = null) => {
  const colors = await locator.evaluate((element, pseudo) => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d')
    const rgba = color => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); const data = [...ctx.getImageData(0, 0, 1, 1).data]; return [...data.slice(0, 3), data[3] / 255] }
    const merge = (front, back) => front.slice(0, 3).map((value, i) => value * front[3] + back[i] * (1 - front[3]))
    const chain = []; for (let node = element; node; node = node.parentElement) chain.push(node)
    let background = [255, 255, 255]
    for (const node of chain.reverse()) background = merge(rgba(getComputedStyle(node).backgroundColor), background)
    return { foreground: merge(rgba(getComputedStyle(element, pseudo).color), background), background }
  }, pseudo)
  const minimum = ratio(colors.foreground, colors.background)
  report.contrast.push({ theme, label, ratio: Number(minimum.toFixed(2)) })
  if (!report.baseline) assert.ok(minimum >= 4.5, `${theme} ${label} contrast ${minimum.toFixed(2)}`)
}
const note = () => page.getByRole('button', { name: 'Fixture note Original body', exact: true })
const editor = () => page.getByRole('dialog', { name: 'Edit note', exact: true, includeHidden: true })
const deletion = () => page.getByRole('dialog', { name: 'Delete note?', exact: true })
const setTheme = async theme => {
  await page.evaluate(theme => localStorage.setItem('devutils-app', JSON.stringify({ state: { theme, sidebarCollapsed: false, launchMode: 'home', recentToolIds: [] }, version: 0 })), theme)
  await page.reload()
  await note().waitFor()
}
try {
  await page.goto(url + '#/tool/privatebox.keep')
  await note().waitFor()
  for (const theme of ['light', 'dark']) {
    await setTheme(theme)
    await readContrast(page.getByRole('button', { name: 'Take a note…', exact: true }), 'composer prompt', theme)
    await readContrast(page.getByRole('textbox', { name: 'Search notes by title or body', exact: true }), 'search placeholder', theme, '::placeholder')
    await readContrast(page.getByRole('heading', { name: 'Pinned', exact: true }), 'pinned label', theme)
    await readContrast(page.getByText('Empty note', { exact: true }), 'empty card', theme)
    for (const card of await page.locator('#workspace button').filter({ has: page.locator('p') }).all()) {
      const text = (await card.textContent()).trim()
      if (!text.includes('body')) continue
      await readContrast(card.locator('p'), text.split('fixture')[0] + ' card body', theme)
      await readContrast(card.locator('div > div').first(), text.split('fixture')[0] + ' card title', theme)
    }
    await screenshot(`ux-keep-${report.baseline ? 'baseline-' : ''}${theme}-720`)
    await page.getByRole('button', { name: 'Take a note…', exact: true }).click()
    await readContrast(page.getByRole('textbox', { name: 'Note title', exact: true }), 'title placeholder', theme, '::placeholder')
    await readContrast(page.getByRole('textbox', { name: 'Note body', exact: true }), 'body placeholder', theme, '::placeholder')
    await page.getByRole('textbox', { name: 'Note body', exact: true }).fill('Fixture draft stays local')
    await readContrast(page.getByRole('textbox', { name: 'Note body', exact: true }), 'composer body', theme)
    if (!report.baseline) {
      await page.getByRole('button', { name: 'Choose note background', exact: true }).click()
      await page.getByRole('button', { name: 'Mint background', exact: true }).click()
      await readContrast(page.getByRole('textbox', { name: 'Note title', exact: true }), 'mint title placeholder', theme, '::placeholder')
      await readContrast(page.getByRole('textbox', { name: 'Note body', exact: true }), 'mint composer body', theme)
      await page.getByRole('textbox', { name: 'Note body', exact: true }).focus()
      const focus = await page.getByRole('textbox', { name: 'Note body', exact: true }).evaluate(element => ({ outline: getComputedStyle(element).outlineWidth, offset: getComputedStyle(element).outlineOffset }))
      assert.equal(focus.outline, '2px')
      assert.equal(focus.offset, '-3px')
    }
    await screenshot(`ux-keep-composer-${report.baseline ? 'baseline-' : ''}${theme}-720`)
    await page.locator('#workspace').getByRole('button', { name: 'Close', exact: true }).click()
    await page.getByRole('dialog', { name: 'Unsaved changes', exact: true }).getByRole('button', { name: 'Discard changes', exact: true }).click()
    await page.getByRole('textbox', { name: 'Search notes by title or body', exact: true }).fill('no matching fixture')
    await readContrast(page.getByText('No matching notes', { exact: true }), 'search empty', theme)
    await page.getByRole('textbox', { name: 'Search notes by title or body', exact: true }).fill('')
    await page.getByRole('button', { name: 'Sign out of box', exact: true }).click()
    await page.getByRole('textbox', { name: 'Keep password', exact: true }).waitFor()
    await readContrast(page.getByText('Encrypted notes · Default Secret Box', { exact: true }), 'lock subtitle', theme)
    await readContrast(page.getByRole('textbox', { name: 'Keep password', exact: true }), 'password placeholder', theme, '::placeholder')
    await screenshot(`ux-keep-locked-${report.baseline ? 'baseline-' : ''}${theme}-720`)
    await page.getByRole('textbox', { name: 'Keep password', exact: true }).fill('fixture-password')
    await page.getByRole('button', { name: 'Open Keep', exact: true }).click()
    await note().waitFor()
    if (!report.baseline) {
      await note().click()
      await editor().getByRole('button', { name: 'Permanently delete note', exact: true }).click()
      await deletion().waitFor()
      assert.equal(await deletion().getByRole('button', { name: 'Cancel', exact: true }).evaluate(element => element === document.activeElement), true)
      await readContrast(deletion().locator('p').filter({ hasText: /^Fixture note$/ }), 'delete target', theme)
      await readContrast(deletion().getByRole('button', { name: 'Delete note', exact: true }), 'delete action', theme)
      await screenshot(`ux-keep-delete-${theme}-720`)
      await page.keyboard.press('Enter')
      await deletion().waitFor({ state: 'hidden' })
      await editor().getByRole('button', { name: 'Close', exact: true }).click()
      await editor().waitFor({ state: 'hidden' })
    }
  }
  if (!report.baseline) {
    await note().click()
    await editor().getByRole('textbox', { name: 'Note body', exact: true, includeHidden: true }).fill('Unsaved editor draft')
    const trigger = editor().getByRole('button', { name: 'Permanently delete note', exact: true })
    await trigger.click()
    await deletion().waitFor()
    assert.match(await deletion().textContent(), /Fixture note/)
    assert.equal(await deletion().getByRole('button', { name: 'Cancel', exact: true }).evaluate(element => element === document.activeElement), true)
    for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); assert.equal(await deletion().evaluate(element => element.contains(document.activeElement)), true) }
    await page.keyboard.press('Escape')
    await deletion().waitFor({ state: 'hidden' })
    assert.equal(await trigger.evaluate(element => element === document.activeElement), true)
    assert.equal(await editor().getByRole('textbox', { name: 'Note body', exact: true, includeHidden: true }).inputValue(), 'Unsaved editor draft')
    assert.deepEqual(await page.evaluate(() => window.__keepFixture.removes), [])
    await trigger.click()
    await page.evaluate(() => window.__keepFixture.failRemove = true)
    await deletion().getByRole('button', { name: 'Delete note', exact: true }).click()
    await deletion().getByRole('alert').waitFor()
    assert.match(await deletion().getByRole('alert').textContent(), /Fixture delete denied/)
    assert.equal(await page.getByRole('button', { name: 'Fixture note Original body', exact: true, includeHidden: true }).count(), 1)
    await readContrast(deletion().getByRole('alert'), 'delete error', 'dark')
    assert.equal(await editor().getByRole('textbox', { name: 'Note body', exact: true, includeHidden: true }).inputValue(), 'Unsaved editor draft')
    await screenshot('ux-keep-delete-error-dark-720')
    await deletion().getByRole('button', { name: 'Cancel', exact: true }).click()
    await trigger.click()
    await page.evaluate(() => window.__keepFixture.delayRemove = true)
    await deletion().getByRole('button', { name: 'Delete note', exact: true }).click()
    await deletion().getByRole('button', { name: 'Deleting…', exact: true }).waitFor()
    assert.equal(await deletion().getByRole('button', { name: 'Cancel', exact: true }).isDisabled(), true)
    await deletion().getByRole('button', { name: 'Deleting…', exact: true }).evaluate(element => { element.click(); element.click() })
    await page.keyboard.press('Escape')
    assert.equal(await deletion().count(), 1, 'Escape closed active deletion')
    await page.keyboard.press('Control+k')
    assert.equal(await deletion().count(), 1)
    assert.equal(await page.getByRole('dialog', { name: 'Search tools', exact: true }).count(), 0)
    assert.equal(await page.evaluate(() => window.__keepFixture.removes.length), 2)
    await page.evaluate(() => { window.__keepFixture.delayRemove = false; window.__keepFixture.finishRemove() })
    await deletion().waitFor({ state: 'hidden' })
    await editor().waitFor({ state: 'hidden' })
    assert.equal(await note().count(), 0)
    assert.equal(await page.getByRole('button', { name: 'coral fixture Color note body', exact: true }).count(), 1, 'Unrelated note was removed')
    await page.waitForFunction(() => document.activeElement?.textContent.trim() === 'Take a note…')
    assert.deepEqual(await page.evaluate(() => window.__keepFixture.removes), [{ path: 'keep/default.putl', token: 'fixture-session' }, { path: 'keep/default.putl', token: 'fixture-session' }])
    assert.equal(await page.evaluate(() => JSON.stringify(localStorage).includes('Unsaved editor draft')), false)
    assert.equal(nativeDialogs, 0)
    console.log('PASS named delete, Cancel focus, nested focus trap, Escape/focus return, failed delete retains draft, retry, busy Escape/CtrlK/double-submit and exact session/path')
  }
  assert.deepEqual(errors, [])
  if (process.env.BRAND_SCREENSHOT_DIR) await writeFile(join(process.env.BRAND_SCREENSHOT_DIR, `keep-ux-${report.baseline ? 'baseline-' : ''}results.json`), JSON.stringify(report, null, 2))
  console.log(`PASS ${report.contrast.length} computed Keep contrast checks in light/dark; minimum ${Math.min(...report.contrast.map(row => row.ratio)).toFixed(2)}${report.baseline ? ' (baseline capture only)' : ''}`)
} finally { await browser.close(); await new Promise(done => server.close(done)) }
