import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import assert from 'node:assert/strict'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = resolve('out/renderer')
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }
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
const page = await browser.newPage({ viewport: { width: 1180, height: 760 } })
page.setDefaultTimeout(12000)
const errors = [], dialogs = []
page.on('pageerror', error => errors.push(error.message))
page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss() })
await page.addInitScript(() => {
  const vault = { id: 'fixture-box', name: 'Fixture box', mode: 'device', rootPath: 'fixture-only', createdAt: '2026-10-09T00:00:00Z' }
  const doc = { id: 'fixture-doc', name: 'Fixture.txt', type: 'text', encoding: 'utf-8', content: 'Saved original', relativePath: 'fixture.putl', updatedAt: vault.createdAt, sessionId: 'fixture-session' }
  const state = window.__draftFixture = { doc, extra: [], reads: 0, writes: [], removes: [], exports: [], failSave: false, delaySave: false, finishSave: null, signouts: 0 }
  window.devutils = {
    platform: async () => 'win32', window: { close() {}, minimize() {}, maximize() {} },
    app: { trayAvailable: async () => true, onOpenTool: () => () => {}, language: async () => ({ language: 'en', resolved: 'en' }) },
    privateBox: {
      getStatus: async () => ({ configured: true, hasAccess: true, mode: 'device', rootPath: vault.rootPath, activeId: vault.id, vaults: [vault], sessionId: doc.sessionId }),
      list: async () => [doc, ...state.extra].map(file => ({ ...file, kind: 'file' })),
      readFile: async path => { state.reads++; return { ...(path === doc.relativePath ? doc : state.extra.find(file => file.relativePath === path)) } },
      writeFile: async (path, content) => {
        if (state.delaySave) { state.delaySave = false; await new Promise(done => { state.finishSave = done }) }
        if (state.failSave) { state.failSave = false; throw new Error('Fixture save failed') }
        const file = path === doc.relativePath ? doc : state.extra.find(file => file.relativePath === path)
        file.content = content; state.writes.push(content); return { ...file }
      },
      createFile: async (_directory, name, type) => {
        const file = { ...doc, id: 'new-doc', name, type, content: '', relativePath: 'new.putl' }
        state.extra.push(file); return { ...file }
      },
      rename: async (path, name) => { const file = path === doc.relativePath ? doc : state.extra.find(file => file.relativePath === path); file.name = name; return { ...file, kind: 'file' } },
      remove: async path => { state.removes.push(path) },
      exportToDisk: async path => { state.exports.push({ path, content: doc.content }); return null },
      clearAccess: async () => { state.signouts++ }
    }
  }
})
const editor = () => page.locator('.cm-content[contenteditable="true"]').first()
const unsaved = () => page.getByRole('dialog', { name: 'Unsaved changes', exact: true })
const home = () => page.locator('main header').getByRole('link', { name: 'All tools', exact: true })
const file = () => page.getByRole('button', { name: /^Fixture(?: renamed)?\.txt$/ }).first()
const reopen = async () => {
  await page.goto(url + '#/tool/privatebox.home')
  if (await editor().count()) await page.getByTitle('Close', { exact: true }).last().click()
  await file().dblclick()
  await editor().waitFor()
}
try {
  await reopen()
  await editor().fill('Private unsaved original')
  const reads = await page.evaluate(() => window.__draftFixture.reads)
  await file().focus(); await page.keyboard.press('Enter')
  assert.equal(await editor().innerText(), 'Private unsaved original')
  assert.equal(await page.evaluate(() => window.__draftFixture.reads), reads)
  assert.equal(await editor().evaluate(element => element === document.activeElement), true)
  assert.equal(await page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented }), true)
  await home().click(); await unsaved().waitFor()
  await unsaved().getByRole('button', { name: 'Keep editing', exact: true }).click()
  assert.equal(await editor().innerText(), 'Private unsaved original')
  await page.evaluate(() => { window.__draftFixture.failSave = true })
  await home().click(); await unsaved().getByRole('button', { name: 'Save and continue', exact: true }).click()
  await unsaved().getByRole('alert').waitFor()
  assert.equal(await editor().innerText(), 'Private unsaved original')
  assert.equal(await page.evaluate(() => window.__draftFixture.writes.length), 0)
  await unsaved().getByRole('button', { name: 'Save and continue', exact: true }).click()
  await page.locator('#home-tool-search').waitFor()
  assert.equal(await page.evaluate(() => window.__draftFixture.writes.at(-1)), 'Private unsaved original')
  console.log('PASS dirty Home navigation, same-file focus, unload guard and failed-save retry preserve drafts')

  await reopen(); await editor().fill('Save before creating')
  await page.keyboard.press('Control+n'); await unsaved().waitFor()
  await unsaved().getByRole('button', { name: 'Keep editing', exact: true }).click()
  assert.equal(await page.getByRole('dialog').count(), 0)
  await editor().focus(); await page.keyboard.press('Control+n')
  await unsaved().getByRole('button', { name: 'Save and continue', exact: true }).click()
  const create = page.getByRole('dialog', { name: 'New text file', exact: true })
  await create.getByRole('textbox').fill('Created.txt')
  await create.getByRole('button', { name: 'Create', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.cm-content')?.textContent === '')
  assert.equal(await page.evaluate(() => window.__draftFixture.doc.content), 'Save before creating')
  console.log('PASS New File requires explicit Save/Discard/Keep editing before replacing a document')

  await reopen(); await editor().fill('Private renamed draft')
  await file().focus(); await page.keyboard.press('F2')
  const rename = page.getByRole('dialog', { name: 'Rename', exact: true })
  await rename.getByRole('textbox').fill('Fixture renamed.txt')
  await rename.getByRole('button', { name: 'Rename', exact: true }).click()
  await page.getByRole('button', { name: 'Fixture renamed.txt', exact: true }).waitFor()
  assert.equal(await editor().innerText(), 'Private renamed draft')
  assert.equal(await page.getByRole('button', { name: 'Save', exact: true }).isEnabled(), true)
  await file().focus(); await page.keyboard.press('Shift+F10')
  await page.getByRole('menuitem', { name: 'Export saved file…', exact: true }).click()
  await page.waitForFunction(() => window.__draftFixture.exports.length === 1)
  assert.equal(await page.evaluate(() => window.__draftFixture.exports[0].content), 'Save before creating')
  assert.equal(await editor().innerText(), 'Private renamed draft')
  await file().focus(); await page.keyboard.press('Delete')
  await unsaved().getByRole('button', { name: 'Keep editing', exact: true }).click()
  assert.deepEqual(await page.evaluate(() => window.__draftFixture.removes), [])
  console.log('PASS Rename retains the draft; Export explicitly uses saved bytes; Delete can be cancelled')

  await page.evaluate(() => { window.__draftFixture.delaySave = true })
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.waitForFunction(() => typeof window.__draftFixture.finishSave === 'function')
  await editor().fill('Edited while saving')
  await home().click(); await unsaved().waitFor()
  assert.equal(await unsaved().getByRole('button', { name: 'Discard changes', exact: true }).isDisabled(), true)
  await page.evaluate(() => window.__draftFixture.finishSave())
  await unsaved().getByRole('button', { name: 'Keep editing', exact: true }).click()
  assert.equal(await editor().innerText(), 'Edited while saving')
  assert.equal(await page.getByRole('button', { name: 'Save', exact: true }).isEnabled(), true)
  assert.doesNotMatch(await page.evaluate(() => JSON.stringify(localStorage)), /Private unsaved|Private renamed|Edited while saving/)
  assert.deepEqual(errors, [])
  console.log('PASS Save in flight blocks leaving; newer edits remain dirty; no draft persistence or renderer crashes')
} finally { await browser.close(); await new Promise(done => server.close(done)) }
