import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import assert from 'node:assert/strict'

// Production UI with a RAM-only bridge fixture. Main crypto/IPC have separate
// regression and native tests; this fixture never reads a real user vault.
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
await new Promise((done) => server.listen(0, '127.0.0.1', done))
const url = `http://127.0.0.1:${server.address().port}/index.html`
const browser = await chromium.launch({ channel: process.env.UX_BROWSER_CHANNEL || undefined, headless: true })
const page = await browser.newPage({ viewport: { width: 720, height: 500 } })
page.setDefaultTimeout(10000)
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('dialog', (dialog) => dialog.dismiss())
await page.addInitScript(() => {
  const state = window.__lockFixture = { locked: false, session: 'first-session', checkpoints: [], handlers: [], saved: [], failPreserve: false, idleMinutes: 15, delayState: false, finishState: null }
  const vault = { id: 'fixture-box', name: 'Fixture box', mode: 'device', rootPath: 'fixture-only', createdAt: '2026-10-06T00:00:00Z' }
  const doc = { id: 'fixture-doc', name: 'Fixture document.txt', relativePath: 'fixture.putl', type: 'text', encoding: 'utf-8', content: 'Original document' }
  const note = { ...doc, id: 'fixture-note', name: 'Fixture.keep.json', relativePath: 'keep/fixture.putl', type: 'keep-note', content: JSON.stringify({ title: 'Fixture note', body: 'Original note', color: 'default', pinned: false, extension: { preserve: true } }) }
  const entry = (doc) => ({ ...doc, kind: 'file' })
  const requireSession = (token) => { if (state.locked || token !== state.session) throw new Error('SESSION_CHANGED') }
  const unlock = async () => { state.locked = false; state.session = crypto.randomUUID(); return state.session }
  state.lock = (reason = 'suspend') => {
    const event = { id: crypto.randomUUID(), reason, canPreserveDraft: !state.locked }
    state.locked = true
    if (event.canPreserveDraft) state.checkpoints.push({ id: event.id, content: null })
    state.handlers.slice().forEach((callback) => callback(event))
  }
  window.devutils = {
    platform: async () => 'win32', app: { trayAvailable: async () => true, onOpenTool: () => () => {} },
    window: { close() {}, minimize() {}, maximize() {} },
    security: {
      state: async () => {
        const result = { idleMinutes: state.idleMinutes, lastLock: null, hasDraft: state.checkpoints.some((draft) => draft.content) }
        if (state.delayState) { state.delayState = false; await new Promise((done) => { state.finishState = done }) }
        return result
      },
      setIdleMinutes: async (minutes) => { state.idleMinutes = minutes; return { idleMinutes: minutes } },
      onVaultLocked: (callback) => { state.handlers.push(callback); return () => { state.handlers = state.handlers.filter((handler) => handler !== callback) } },
      preserveDraft: async (id, content) => { if (state.failPreserve) { state.failPreserve = false; throw new Error('Fixture failure') } const checkpoint = state.checkpoints.find((draft) => draft.id === id); if (!checkpoint || checkpoint.content) throw new Error('Expired'); checkpoint.content = content },
      releaseEmpty: async (id) => { state.checkpoints = state.checkpoints.filter((draft) => draft.id !== id || draft.content) },
      recoverDraft: async (token) => { requireSession(token); return state.checkpoints.find((draft) => draft.content) ?? null },
      discardDraft: async (token, id) => { requireSession(token); state.checkpoints = state.checkpoints.filter((draft) => draft.id !== id) }
    },
    privateBox: {
      ensureDefault: async () => vault,
      getStatus: async () => ({ configured: true, hasAccess: !state.locked, mode: 'device', rootPath: vault.rootPath, activeId: vault.id, vaults: [vault], sessionId: state.locked ? undefined : state.session }),
      prepareDefaultForSave: async () => ({ boxId: vault.id, hasAccess: !state.locked, sessionId: state.session }),
      access: unlock, accessDefault: unlock, clearAccess: async () => { state.locked = true },
      list: async () => [entry(doc)], mkdir: async () => {},
      readFile: async (path, token) => { requireSession(token); return { ...(path === doc.relativePath ? doc : note), sessionId: token } },
      listKeepNotes: async (token) => { requireSession(token); return { notes: [{ ...note, sessionId: token }], unreadable: [], nextCursor: null } },
      writeFile: async (path, content, token) => { requireSession(token); const target = path === doc.relativePath ? doc : note; target.content = content; state.saved.push(content); return { ...target, sessionId: token } },
      saveDocument: async (payload, token) => { requireSession(token); state.saved.push(payload.content); return { doc: { ...note, content: payload.content, sessionId: token } } }
    }
  }
})
const go = async (id) => { await page.evaluate((id) => { window.location.hash = `/tool/${id}` }, id); await page.locator(`[data-tool-ready="${id}"]`).waitFor() }
const lock = async (reason = 'suspend') => page.evaluate((reason) => window.__lockFixture.lock(reason), reason)
const recover = async (passwordLabel) => {
  await page.getByLabel(passwordLabel, { exact: true }).fill('fixture password')
  await page.getByLabel(passwordLabel, { exact: true }).press('Enter')
  await page.getByRole('dialog', { name: 'Recover unsaved changes', exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Restore to editor', exact: true }).isEnabled(), true)
  await page.getByRole('button', { name: 'Restore to editor', exact: true }).click()
  await page.getByRole('dialog', { name: 'Recover unsaved changes', exact: true }).waitFor({ state: 'hidden' })
}
try {
  await page.goto(url + '#/tool/privatebox.home')
  await page.getByRole('button', { name: 'Fixture document.txt', exact: true }).dblclick()
  await page.locator('.cm-content').fill('private unsaved document')
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent.trim() === 'Save' && !button.disabled))
  await lock()
  await page.getByLabel('Password', { exact: true }).waitFor()
  assert.doesNotMatch(await page.locator('body').innerText(), /private unsaved document/)
  assert.doesNotMatch(await page.evaluate(() => JSON.stringify(localStorage)), /private unsaved document/)
  await lock('screen-lock')
  assert.equal(await page.evaluate(() => window.__lockFixture.checkpoints.filter((draft) => draft.content).length), 1)
  await page.evaluate(() => { window.__lockFixture.delayState = true })
  await recover('Password')
  assert.equal(await page.locator('.cm-content').innerText(), 'private unsaved document')
  assert.equal(await page.evaluate(() => window.__lockFixture.saved.length), 0)
  await page.locator('.cm-content').fill('private draft after recovery')
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent.trim() === 'Save' && !button.disabled))
  await lock()
  await page.getByLabel('Password', { exact: true }).waitFor()
  await page.evaluate(() => { window.__lockFixture.finishState(); window.__lockFixture.finishState = null })
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
  assert.equal(await page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented }), true)
  await recover('Password')
  assert.equal(await page.locator('.cm-content').innerText(), 'private draft after recovery')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.waitForFunction(() => window.__lockFixture.saved.length === 1)
  console.log('PASS document lock masks plaintext, survives repeated OS events, requires explicit reauthenticated restore and rejects stale close-guard state')

  await go('privatebox.keep')
  await page.getByLabel('Keep password').fill('fixture password')
  await page.getByLabel('Keep password').press('Enter')
  await page.getByRole('button', { name: 'Fixture note Original note', exact: true }).click()
  await page.getByLabel('Note body', { exact: true }).fill('private unsaved note')
  await page.evaluate(() => { window.__lockFixture.failPreserve = true })
  await lock('idle')
  await page.getByRole('button', { name: 'Retry protecting draft' }).waitFor()
  await page.getByRole('button', { name: 'Retry protecting draft' }).focus()
  await page.keyboard.press('Shift+Tab')
  assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Discard unsaved changes')
  await page.keyboard.press('Tab')
  assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Retry protecting draft')
  assert.equal(await page.getByRole('dialog', { name: 'Edit note', exact: true }).isVisible(), false)
  assert.doesNotMatch(await page.locator('body').innerText(), /private unsaved note/)
  await page.getByRole('button', { name: 'Retry protecting draft' }).click()
  await page.getByLabel('Keep password').waitFor()
  await recover('Keep password')
  assert.equal(await page.getByLabel('Note body', { exact: true }).inputValue(), 'private unsaved note')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await page.waitForFunction(() => window.__lockFixture.saved.length === 2)
  assert.equal(await page.evaluate(() => JSON.parse(window.__lockFixture.saved.at(-1)).extension.preserve), true)
  await page.getByRole('button', { name: 'Take a note…', exact: true }).click()
  await page.getByLabel('Note title').fill('Unsaved composer')
  await page.getByLabel('Note body').fill('private composer body')
  await lock()
  await page.getByLabel('Keep password').waitFor()
  await recover('Keep password')
  assert.equal(await page.getByLabel('Note body').inputValue(), 'private composer body')
  await page.getByRole('button', { name: 'Save note', exact: true }).click()
  await page.waitForFunction(() => window.__lockFixture.saved.length === 3)
  assert.doesNotMatch(await page.evaluate(() => JSON.stringify(localStorage)), /private unsaved|private composer/)
  console.log('PASS Keep existing note/unknown fields and new composer recover; capture failure masks portals and retains a retryable draft')

  await go('json.studio')
  await page.locator('.cm-content').first().fill('{"retentionmarker":"private input"}')
  await page.waitForTimeout(450)
  await go('app.settings')
  await page.getByRole('group', { name: 'Tool input retention', exact: true }).getByRole('button', { name: 'Off', exact: true }).click()
  await page.getByLabel('Lock boxes after device idle').selectOption('5')
  await page.waitForFunction(() => window.__lockFixture.idleMinutes === 5)
  await go('json.studio')
  assert.doesNotMatch(await page.locator('.cm-content').first().innerText(), /retentionmarker/)
  await page.locator('.cm-content').first().fill('{"retentionmarker":"delayed input"}')
  await page.waitForTimeout(450)
  await go('app.settings'); await go('json.studio')
  assert.doesNotMatch(await page.locator('.cm-content').first().innerText(), /retentionmarker/)
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('devutils-app')).state.inputRetention), 'off')
  assert.deepEqual(errors, [])
  console.log('PASS retention Off clears prior inputs, rejects later drafts and persists only privacy metadata; idle settings work at minimum window size')
} catch (error) {
  console.log('Fixture state:', await page.evaluate(() => ({ locked: window.__lockFixture.locked, drafts: window.__lockFixture.checkpoints.map((draft) => ({ id: draft.id, present: !!draft.content })), masked: document.documentElement.dataset.vaultMasked, text: document.body.innerText.slice(-700) })))
  throw error
} finally { await browser.close(); await new Promise((done) => server.close(done)) }
