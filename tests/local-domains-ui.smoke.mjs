import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve, extname, sep, join } from 'node:path'
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = resolve('out/renderer')
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }
const server = createServer(async (req, res) => {
  try {
    const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname)
    if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return }
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' }).end(await readFile(path))
  } catch { res.writeHead(404).end() }
})
await new Promise(done => server.listen(0, '127.0.0.1', done))
const url = 'http://127.0.0.1:' + server.address().port + '/index.html'
const browser = await chromium.launch({ channel: process.env.UX_BROWSER_CHANNEL || undefined, headless: true })
const context = await browser.newContext({ viewport: { width: 1180, height: 820 } })
await context.addInitScript(() => {
  const state = window.__domains = { entries: [], ports: { http: 80, https: 443 }, orphanedDomains: [], warnings: [], mkcertAvailable: true, caInstalled: false, calls: [], denied: false, hold: false, release: null, corrupt: false, copied: '' }
  const snapshot = () => {
    if (state.corrupt) throw new Error('Local domain settings could not be read. Existing settings and hosts were left unchanged.')
    return structuredClone({ entries: state.entries, ports: state.ports, orphanedDomains: state.orphanedDomains, warnings: state.warnings, mkcertAvailable: state.mkcertAvailable, caInstalled: state.caInstalled })
  }
  window.devutils = {
    platform: async () => 'win32', app: { trayAvailable: async () => true, onOpenTool: () => () => {} },
    window: { minimize() {}, maximize() {}, close() {}, isMaximized: async () => false }, privateBox: { ensureDefault: async () => ({ id: 'fixture' }) },
    localDomains: {
      status: async () => snapshot(),
      add: async value => { state.calls.push('add'); state.entries.push({ ...value, id: crypto.randomUUID(), active: false, hostsMapped: false, url: (value.https ? 'https://' : 'http://') + value.domain }); return snapshot() },
      enable: async id => {
        state.calls.push('enable')
        if (state.hold) await new Promise(done => { state.release = done })
        if (state.denied) throw new Error('Authorization cancelled; hosts were left unchanged.')
        const entry = state.entries.find(entry => entry.id === id); entry.active = true; entry.hostsMapped = true; return snapshot()
      },
      disable: async id => { state.calls.push('disable'); if (state.denied) throw new Error('Authorization cancelled'); const entry = state.entries.find(entry => entry.id === id); entry.active = false; entry.hostsMapped = false; return snapshot() },
      remove: async id => { state.calls.push('remove'); state.entries = state.entries.filter(entry => entry.id !== id); return snapshot() },
      cleanup: async () => { state.calls.push('cleanup'); state.entries.forEach(entry => { entry.active = false; entry.hostsMapped = false }); state.orphanedDomains = [] },
      setupHttps: async () => { state.calls.push('setupHttps'); state.caInstalled = true; return snapshot() },
      removeCa: async () => { state.calls.push('removeCa'); state.caInstalled = false; return snapshot() },
      resolve: async domain => ({ domain, addresses: state.entries.some(entry => entry.domain === domain && entry.hostsMapped) ? ['127.0.0.1', '::1'] : ['192.0.2.1'], local: state.entries.some(entry => entry.domain === domain && entry.hostsMapped) }),
      open: async id => { state.calls.push('open:' + id) }, mkcertHelp: async () => { state.calls.push('help') },
      setPorts: async ports => { state.ports = ports; return snapshot() }
    }
  }
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { state.copied = text } } })
})
const page = await context.newPage(); page.setDefaultTimeout(15000)
const errors = [], requests = []
page.on('pageerror', error => errors.push(error.message)); page.on('request', request => requests.push(request.url()))
const button = name => page.getByRole('button', { name, exact: true })
const dialog = () => page.getByRole('dialog')
async function screenshot(name) {
  if (process.env.BRAND_SCREENSHOT_DIR) { await mkdir(process.env.BRAND_SCREENSHOT_DIR, { recursive: true }); await page.screenshot({ path: join(process.env.BRAND_SCREENSHOT_DIR, name + '.png') }) }
}
try {
  await page.goto(url + '#/tool/network.local-domains')
  await page.getByText('No local domains yet.', { exact: false }).waitFor()
  assert.deepEqual(await page.evaluate(() => window.__domains.calls), [])
  await page.getByLabel('Domain', { exact: true }).fill('toi.vn')
  await button('Save mapping').click()
  await page.getByText('localhost:3000 · HTTP · Disabled', { exact: true }).waitFor()
  assert.deepEqual(await page.evaluate(() => window.__domains.calls), ['add'])
  await button('Enable toi.vn').click(); await dialog().waitFor()
  await page.keyboard.press('Escape'); await dialog().waitFor({ state: 'hidden' })
  assert.deepEqual(await page.evaluate(() => window.__domains.calls), ['add'])
  await button('Enable toi.vn').click()
  await page.evaluate(() => { window.__domains.hold = true; window.__domains.denied = true })
  await dialog().getByRole('button', { name: 'Enable mapping', exact: true }).click()
  await page.waitForFunction(() => window.__domains.release !== null)
  await page.keyboard.press('Escape')
  assert.equal(await dialog().isVisible(), true)
  assert.equal(await page.locator('button[type="submit"]').isEnabled(), false)
  await page.evaluate(() => { window.__domains.hold = false; window.__domains.release() })
  await page.getByRole('alert').filter({ hasText: 'Authorization cancelled' }).waitFor()
  await dialog().getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.equal(await button('Open toi.vn').isEnabled(), false)
  await page.evaluate(() => { window.__domains.denied = false })
  await button('Enable toi.vn').click(); await dialog().getByRole('button', { name: 'Enable mapping', exact: true }).click()
  await page.getByText('localhost:3000 · HTTP · Active', { exact: true }).waitFor()
  await button('Open toi.vn').click()
  await button('Copy URL for toi.vn').click()
  assert.equal(await page.evaluate(() => window.__domains.copied), 'http://toi.vn')
  await screenshot('local-domains-active-dark-1180')
  await page.evaluate(() => { window.__domains.entries[0].hostsMapped = false })
  await button('Refresh').click()
  await page.getByText('localhost:3000 · HTTP · Hosts entry missing', { exact: true }).waitFor()
  assert.equal(await button('Open toi.vn').isEnabled(), false)
  await button('Restore hosts entry toi.vn').click()
  await dialog().getByRole('button', { name: 'Enable mapping', exact: true }).click()
  await page.getByText('localhost:3000 · HTTP · Active', { exact: true }).waitFor()
  await button('Disable toi.vn').click()
  await page.getByText('localhost:3000 · HTTP · Disabled', { exact: true }).waitFor()
  await button('Check address').click()
  await page.getByRole('status').filter({ hasText: 'No loopback address returned.' }).waitFor()
  await button('Setup HTTPS').click()
  await page.getByText('Dedicated CA setup completed.', { exact: false }).waitFor()
  await page.getByLabel('Domain', { exact: true }).fill('app.test'); await page.getByLabel('Use HTTPS', { exact: true }).check()
  await button('Save mapping').click(); await button('Enable app.test').waitFor()
  await page.evaluate(() => { window.__domains.entries[1].hostsMapped = true; window.__domains.orphanedDomains = ['orphan.test'] })
  await button('Refresh').click(); await page.getByText('Local overrides need attention', { exact: true }).waitFor()
  await page.setViewportSize({ width: 720, height: 700 })
  await button('Switch to light theme').click()
  await screenshot('local-domains-recovery-light-720')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  const overflowing = await page.locator('input, button, p, h2, h3').evaluateAll(elements => elements.filter(element => {
    const box = element.getBoundingClientRect(); return box.width > 0 && (box.left < -1 || box.right > innerWidth + 1)
  }).map(element => element.textContent || element.getAttribute('aria-label')))
  assert.deepEqual(overflowing, [])
  await button('Remove local overrides').click(); await dialog().getByRole('button', { name: 'Remove overrides', exact: true }).click()
  await page.getByText('Local overrides need attention', { exact: true }).waitFor({ state: 'hidden' })
  assert.equal(await button('Open app.test').isEnabled(), false)
  await page.getByLabel('Domain', { exact: true }).fill('uctalent.app')
  await page.getByLabel('Use HTTPS', { exact: true }).uncheck()
  await page.getByRole('status').filter({ hasText: 'Browsers require HTTPS for .app domains.' }).waitFor()
  await button('Save mapping').click()
  await button('Enable uctalent.app').click(); await dialog().getByRole('button', { name: 'Enable mapping', exact: true }).click()
  assert.equal(await button('Open uctalent.app').isEnabled(), false)
  await page.getByText('To change this saved mapping', { exact: false }).waitFor()
  await button('Remove uctalent.app').click(); await dialog().getByRole('button', { name: 'Remove mapping', exact: true }).click()
  await button('Remove toi.vn').click(); await dialog().getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.equal(await button('Remove toi.vn').count(), 1)
  await button('Remove toi.vn').click(); await dialog().getByRole('button', { name: 'Remove mapping', exact: true }).click()
  await button('Remove toi.vn').waitFor({ state: 'hidden' })
  await page.waitForFunction(() => document.activeElement?.getAttribute('placeholder') === 'app.test')
  await button('Remove HTTPS trust').click(); await dialog().getByRole('button', { name: 'Remove trust', exact: true }).click()
  assert.equal(await button('Enable app.test').isEnabled(), false)
  await page.evaluate(() => { window.__domains.corrupt = true; window.__domains.orphanedDomains = ['toi.vn'] })
  await button('Refresh').click(); await page.getByRole('alert').waitFor()
  await button('Remove local overrides').click(); await dialog().getByRole('button', { name: 'Remove overrides', exact: true }).click()
  await dialog().waitFor({ state: 'hidden' })
  await page.getByRole('alert').filter({ hasText: 'Local overrides were removed' }).waitFor()
  assert.deepEqual(await page.evaluate(() => window.__domains.orphanedDomains), [])
  assert.deepEqual(errors, []); assert.equal(requests.some(value => !value.startsWith('http://127.0.0.1:')), false)
  console.log('PASS Local Domains: idle save, confirmation/cancellation/busy state, enable/open/copy/disable, resolution, HTTPS, crash recovery, corrupt settings cleanup, removal/focus, dark1180/light720 layouts')
} finally { await context.close(); await browser.close(); await new Promise(done => server.close(done)) }
