import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import assert from 'node:assert/strict'

// Production renderer + RAM-only vault fixture. No native files, user vault,
// clipboard or real mutations are accessed by this keyboard/geometry check.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = resolve('out/renderer')
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }
const server = createServer(async (request, response) => {
  try {
    const path = resolve(root, '.' + new URL(request.url, 'http://localhost').pathname)
    if (!path.startsWith(root + sep)) { response.writeHead(403).end(); return }
    const bytes = await readFile(path)
    response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' }).end(bytes)
  } catch { response.writeHead(404).end() }
})
const browser = await chromium.launch({ channel: process.env.UX_BROWSER_CHANNEL || undefined, headless: true })
await new Promise(done => server.listen(0, '127.0.0.1', done))
const url = `http://127.0.0.1:${server.address().port}/index.html`
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } })
page.setDefaultTimeout(10000)
const errors = []
let confirmations = 0
page.on('pageerror', error => errors.push(error.message))
page.on('dialog', async dialog => { confirmations++; await dialog.dismiss() })
await page.addInitScript(() => {
  const state = window.__menuFixture = { reads: [], removes: [], exports: [] }
  const entry = { id: 'fixture-file', kind: 'file', type: 'text', name: 'Fixture document.txt', relativePath: 'fixture.putl' }
  const vault = { id: 'fixture-box', name: 'Fixture box', mode: 'device', rootPath: 'C:/fixture-only', createdAt: '2026-10-05T00:00:00Z' }
  window.devutils = {
    platform: async () => 'win32',
    window: { close() {}, minimize() {}, maximize() {} },
    app: { trayAvailable: async () => true, onOpenTool: () => () => {} },
    privateBox: {
      ensureDefault: async () => vault,
      getStatus: async () => ({ configured: true, hasAccess: true, mode: 'device', rootPath: vault.rootPath, activeId: vault.id, vaults: [vault], sessionId: 'fixture-session' }),
      list: async () => [entry],
      readFile: async (path, sessionId) => { state.reads.push(path); return { ...entry, content: 'Fixture text', updatedAt: vault.createdAt, sessionId } },
      remove: async path => { state.removes.push(path) },
      exportToDisk: async path => { state.exports.push(path); return null },
      clearAccess: async () => {}
    }
  }
})
const file = () => page.getByRole('button', { name: 'Fixture document.txt', exact: true })
const menu = () => page.getByRole('menu', { name: 'Actions for Fixture document.txt', exact: true })
const activeName = () => page.evaluate(() => document.activeElement?.textContent.trim())
const openKeyboard = async () => {
  await file().focus()
  await page.keyboard.press('Shift+F10')
  await menu().waitFor()
}
const bounds = async () => {
  const value = await menu().evaluate(element => {
    const box = element.getBoundingClientRect()
    const viewport = window.visualViewport
    return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height,
      viewport: { left: viewport?.offsetLeft ?? 0, top: viewport?.offsetTop ?? 0, width: viewport?.width ?? window.innerWidth, height: viewport?.height ?? window.innerHeight },
      scrollable: element.scrollHeight > element.clientHeight }
  })
  assert.ok(value.left >= value.viewport.left + 7, JSON.stringify(value))
  assert.ok(value.top >= value.viewport.top + 7, JSON.stringify(value))
  assert.ok(value.right <= value.viewport.left + value.viewport.width - 7, JSON.stringify(value))
  assert.ok(value.bottom <= value.viewport.top + value.viewport.height - 7, JSON.stringify(value))
  return value
}

try {
  await page.goto(url + '#/tool/privatebox.home')
  await file().waitFor()
  await openKeyboard()
  assert.equal(await activeName(), 'OpenEnter')
  await page.keyboard.press('ArrowDown')
  assert.equal(await activeName(), 'Export as plain…')
  await page.keyboard.press('ArrowDown')
  assert.equal(await activeName(), 'RenameF2')
  await page.keyboard.press('End')
  assert.equal(await activeName(), 'New Folder')
  await page.keyboard.press('ArrowDown')
  assert.equal(await activeName(), 'OpenEnter')
  // Exercise an unavailable menu item; query-based navigation must skip it.
  await menu().getByRole('menuitem', { name: 'Export as plain…', exact: true }).evaluate(element => { element.disabled = true })
  await page.keyboard.press('ArrowDown')
  assert.equal(await activeName(), 'RenameF2')
  await page.keyboard.press('Home')
  await page.keyboard.press('Delete')
  await page.keyboard.press('F2')
  assert.equal(await page.getByRole('dialog', { name: 'Rename', exact: true }).count(), 0)
  assert.deepEqual(await page.evaluate(() => window.__menuFixture.removes), [])
  assert.equal(confirmations, 0, 'Delete leaked behind the visible menu')
  await page.keyboard.press('Escape')
  assert.equal(await menu().count(), 0)
  assert.equal(await file().evaluate(element => element === document.activeElement), true)
  await openKeyboard()
  await page.keyboard.press('Tab')
  assert.equal(await menu().count(), 0)
  assert.equal(await file().evaluate(element => element === document.activeElement), true)
  console.log('PASS keyboard invocation, arrow/Home/End, disabled skip, no background Delete/F2, Escape/Tab focus return')

  await openKeyboard()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Save', exact: true }).waitFor()
  assert.deepEqual(await page.evaluate(() => window.__menuFixture.reads), ['fixture.putl'], 'Enter invoked both menu and desktop Open')
  await page.getByTitle('Close', { exact: true }).last().click()
  await openKeyboard()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  const rename = page.getByRole('dialog', { name: 'Rename', exact: true })
  await rename.waitFor()
  assert.equal(await rename.getByRole('textbox').evaluate(element => element === document.activeElement), true)
  await page.keyboard.press('Control+k')
  assert.equal(await page.getByRole('dialog', { name: 'Search tools', exact: true }).count(), 0, 'Search obscured the rename confirmation')
  assert.equal(await rename.isVisible(), true)
  await page.keyboard.press('Control+n')
  assert.equal(await rename.count(), 1, 'Shortcut replaced the visible dialog')
  await rename.getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.equal(await file().evaluate(element => element === document.activeElement), true)
  await openKeyboard()
  await page.keyboard.press('Control+k')
  await page.getByRole('dialog', { name: 'Search tools', exact: true }).waitFor()
  assert.equal(await menu().count(), 0, 'Global tool search left the context menu above the palette')
  await page.keyboard.press('F2')
  assert.equal(await rename.count(), 0, 'F2 leaked behind the palette')
  await page.keyboard.press('Escape')
  console.log('PASS Enter activates once; dialog/palette shortcut isolation and next-dialog focus ownership')

  await page.setViewportSize({ width: 720, height: 500 })
  await file().evaluate(element => element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: window.innerWidth - 2, clientY: window.innerHeight - 2 })))
  await menu().waitFor()
  await bounds()
  await page.setViewportSize({ width: 720, height: 240 })
  assert.equal((await bounds()).scrollable, true, 'Short viewport menu needs scrolling')
  await page.keyboard.press('End')
  const last = await menu().getByRole('menuitem', { name: 'New Folder', exact: true }).boundingBox()
  const area = await menu().boundingBox()
  assert.ok(last && area && last.y >= area.y && last.y + last.height <= area.y + area.height + 1, 'Last menu item cannot be reached in a short viewport')
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 })
  await page.waitForFunction(() => window.visualViewport?.scale === 2)
  await bounds()
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 })
  await page.keyboard.press('Escape')
  console.log('PASS actual viewport clamping, scrolling, resize and 2× visual viewport scaling')

  await openKeyboard()
  await page.getByRole('button', { name: 'New box', exact: true }).focus()
  assert.equal(await menu().count(), 0, 'Menu stayed open after focus moved outside')
  assert.equal(await page.getByRole('button', { name: 'New box', exact: true }).evaluate(element => element === document.activeElement), true, 'Menu stole outside focus')
  assert.deepEqual(errors, [])
  console.log('PASS outside focus dismisses without stealing focus; no renderer errors or real vault access')
} finally {
  await browser.close()
  await new Promise(done => server.close(done))
}
