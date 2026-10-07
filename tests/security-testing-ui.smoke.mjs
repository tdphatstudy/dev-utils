import { workspaceField, workspaceValue } from './tool-workspace.fixture.mjs'
import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve, extname, sep, join } from 'node:path'
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = resolve('out/renderer'), mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }
const server = createServer(async (request, response) => {
  try {
    const path = resolve(root, '.' + (new URL(request.url, 'http://localhost').pathname === '/' ? '/index.html' : new URL(request.url, 'http://localhost').pathname))
    if (!path.startsWith(root + sep)) { response.writeHead(403).end(); return }
    response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' }).end(await readFile(path))
  } catch { response.writeHead(404).end() }
})
await new Promise(done => server.listen(0, '127.0.0.1', done))
const url = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ channel: process.env.UX_BROWSER_CHANNEL || undefined, headless: true })
const page = await browser.newPage({ viewport: { width: 1180, height: 760 } })
const consent = new Set(), errors = [], external = [], calls = []
let failedCheck = false
await page.exposeFunction('__accepted', async id => { await new Promise(done => setTimeout(done, 180)); if (failedCheck) { failedCheck = false; throw new Error('fixture unavailable') }; return consent.has(id) })
await page.exposeFunction('__accept', id => { consent.add(id) })
await page.exposeFunction('__record', value => calls.push(value))
await page.addInitScript(() => {
  const listeners = new Set(), jobs = new Map()
  const finding = { severity: 'review', rule: 'fixture-policy', detail: 'Review the application policy before changing it.' }
  window.__testingFixture = { listeners }
  window.devutils = { platform: async () => 'win32', app: { onOpenTool: () => () => {} }, securityTesting: {
    accepted: id => window.__accepted(id), accept: id => window.__accept(id),
    onProgress: callback => { listeners.add(callback); return () => listeners.delete(callback) },
    stop: async id => { await window.__record({ kind: 'stop', id }); return jobs.get(id)?.() ?? false },
    stress: async (input, id) => {
      await window.__record({ kind: 'stress', input })
      return new Promise(resolve => {
        let finished = false, started = 0
        const metrics = state => ({ id, state, requested: input.count, started, completed: started, successful: started, httpErrors: 0, networkErrors: 0, cancelled: 0, active: 0, truncated: 0, bytes: started * 5, elapsedMs: Math.max(1, started * 80), startsPerSecond: 12.5, completionsPerSecond: 12.5, statuses: { 200: started }, latency: { samples: started, p50: 12, p95: 15, p99: 15, max: 15 } })
        const finish = state => { if (finished) return false; finished = true; clearInterval(timer); jobs.delete(id); resolve(metrics(state)); return true }
        const timer = setInterval(() => { started++; for (const listener of listeners) listener(metrics('running')); if (started >= input.count) finish('completed') }, 80)
        jobs.set(id, () => finish('stopped'))
      })
    },
    headers: async (input, id) => { await window.__record({ kind: 'headers', input, id }); return { status: 200, observed: ['content-security-policy'], findings: [finding] } },
    cors: async (input, id) => { await window.__record({ kind: 'cors', input, id }); return { preflightStatus: 204, sampleStatus: 200, findings: [finding] } }
  } }
})
page.on('pageerror', error => errors.push(error.message))
await page.route('**/*', route => { if (new URL(route.request().url()).origin === url) return route.continue(); external.push(route.request().url()); return route.abort() })
const ready = id => page.locator(`[data-tool-ready="${id}"]`).waitFor()
const open = async id => { await page.goto(`${url}/#/tool/${id}`); if (!consent.has(id)) { await page.getByRole('button', { name: 'Agree', exact: true }).click() }; await ready(id) }
const result = name => page.getByRole('region', { name, exact: true })
const capture = async name => { if (process.env.BRAND_SCREENSHOT_DIR) { await page.waitForFunction(() => Array.from(document.querySelectorAll('.mac-page-enter')).every(element => Number(getComputedStyle(element).opacity) >= .99)); await mkdir(process.env.BRAND_SCREENSHOT_DIR, { recursive: true }); await page.screenshot({ path: join(process.env.BRAND_SCREENSHOT_DIR, `hacking-${name}.png`), animations: 'disabled' }) } }
const copy = async label => {
  await page.evaluate(() => { window.fixtureCopy = ''; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.fixtureCopy = value } } }) })
  await page.getByRole('button', { name: label, exact: true }).click()
  return page.evaluate(() => window.fixtureCopy)
}
try {
  const ids = ['hacking.stress', 'hacking.hash', 'hacking.headers', 'hacking.cors', 'hacking.jwt']
  for (const theme of ['dark', 'light']) {
    await page.goto(url)
    await page.evaluate(theme => localStorage.setItem('devutils-app', JSON.stringify({ state: { theme, surfaceMode: 'glass' }, version: 0 })), theme)
    await page.reload()
    await page.waitForFunction(theme => getComputedStyle(document.body).colorScheme === theme, theme)
    for (const [width, height] of [[1180, 760], [720, 500]]) {
      await page.setViewportSize({ width, height }); consent.clear()
      for (const id of ids) {
        const before = calls.length
        await page.goto(`${url}/#/tool/${id}`)
        await page.getByRole('heading', { name: 'Security testing warning', exact: true }).waitFor()
        assert.equal(await page.locator('[data-tool-ready]').count(), 0)
        assert.equal(calls.length, before, 'Gate must never start a request')
        const gate = page.locator('[data-security-gate]')
        assert.equal(await gate.locator('img').count(), 1)
        assert.equal(await gate.getByRole('heading').evaluate(element => element === document.activeElement), true)
        await capture(`gate-${theme}-${width}`)
        await page.getByRole('button', { name: 'Agree', exact: true }).click(); await ready(id)
        assert.equal(await page.locator('#workspace').evaluate(element => element.scrollWidth <= element.clientWidth), true, `${id} overflow`)
        await capture(`${id}-${theme}-${width}`)
      }
    }
  }
  console.log('PASS 5 gated tools, focused warning, no pre-consent execution, light/dark desktop and compact layouts')
  await page.setViewportSize({ width: 1180, height: 760 })
  await open('hacking.hash'); await page.reload(); await ready('hacking.hash')
  assert.equal(await page.locator('[data-security-gate]').count(), 0, 'Main RAM consent survives renderer reload')
  consent.clear(); failedCheck = true
  await page.reload(); await page.getByRole('alert').waitFor()
  assert.equal(await page.locator('[data-tool-ready]').count(), 0)
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await page.getByRole('button', { name: 'Agree', exact: true }).click(); await ready('hacking.hash')
  assert.deepEqual([...consent], ['hacking.hash'])
  await (await workspaceField(page, 'Hash algorithm', { exact: true })).selectOption('MD5')
  await (await workspaceField(page, 'Input text', { exact: true })).fill('x'.repeat(1048577))
  assert.equal(await workspaceValue(page, 'Input text'), '', 'An oversized paste must not create a visible document that differs from submitted state')
  await (await workspaceField(page, 'Input text', { exact: true })).fill('abc')
  await page.getByRole('button', { name: 'Generate hash', exact: true }).click(); await result('Generated hash').waitFor()
  assert.match(await result('Generated hash').innerText(), /900150983cd24fb0d6963f7d28e17f72/)
  await (await workspaceField(page, 'Hash operation', { exact: true })).selectOption('search')
  assert.equal(await result('Generated hash').count(), 0)
  await (await workspaceField(page, 'Target hash (hexadecimal)', { exact: true })).fill('900150983cd24fb0d6963f7d28e17f72')
  await (await workspaceField(page, 'Candidate dictionary', { exact: true })).fill('wrong\nabc')
  await page.getByRole('button', { name: 'Search candidates', exact: true }).click()
  await page.getByRole('button', { name: 'Reveal match', exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Copy matching candidate', exact: true }).count(), 0)
  await page.getByRole('button', { name: 'Reveal match', exact: true }).click()
  assert.equal(await copy('Copy matching candidate'), 'abc')
  await (await workspaceField(page, 'Candidate source', { exact: true })).selectOption('generated')
  await (await workspaceField(page, 'Candidate alphabet', { exact: true })).fill('ab')
  await (await workspaceField(page, 'Maximum length', { exact: true })).fill('2')
  await page.getByRole('button', { name: 'Search candidates', exact: true }).click()
  await result('Candidate search').filter({ hasText: 'No match' }).waitFor()
  await (await workspaceField(page, 'Candidate alphabet', { exact: true })).fill('abcdefghijklmnopqrstuvwxyz0123456789')
  await (await workspaceField(page, 'Maximum length', { exact: true })).fill('16')
  await (await workspaceField(page, 'Attempt budget', { exact: true })).fill('10000000')
  await page.getByRole('button', { name: 'Search candidates', exact: true }).click()
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  assert.match(await page.getByRole('alert').innerText(), /stopped/)
  assert.equal(await result('Candidate search').filter({ hasText: 'Searching…' }).count(), 0)
  await (await workspaceField(page, 'Target hash (hexadecimal)', { exact: true })).fill('f'.repeat(32))
  await (await workspaceField(page, 'Search duration (s)', { exact: true })).fill('1')
  await page.getByRole('button', { name: 'Search candidates', exact: true }).click()
  await result('Candidate search').filter({ hasText: 'Time limit reached' }).waitFor({ timeout: 4000 })
  await (await workspaceField(page, 'Hash operation', { exact: true })).selectOption('generate')
  await (await workspaceField(page, 'Hash algorithm', { exact: true })).selectOption('SHA-256')
  await page.getByRole('button', { name: 'Generate hash', exact: true }).click()
  await result('Generated hash').filter({ hasText: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' }).waitFor()
  console.log('PASS consent retry/reload/session reset, real worker MD5/SHA-256, dictionary/generation/exhaustion, masked match and Stop')
  await open('hacking.stress')
  await (await workspaceField(page, 'Request count', { exact: true })).fill('2')
  await (await workspaceField(page, 'HTTP method', { exact: true })).selectOption('POST')
  await (await workspaceField(page, 'Request body', { exact: true })).selectOption('json')
  await (await workspaceField(page, 'Body content', { exact: true })).fill('{"token":"private-stress-fixture"}')
  await page.getByRole('button', { name: 'Start stress test', exact: true }).click()
  await result('Stress test metrics').filter({ hasText: 'Completed' }).waitFor()
  assert.doesNotMatch(await copy('Copy report'), /private-stress|127\.0\.0\.1|token/)
  await capture('stress-metrics')
  await (await workspaceField(page, 'Body content', { exact: true })).fill('{"token":"updated-private-fixture"}')
  assert.equal(await result('Stress test metrics').count(), 0, 'Editing a CodeMirror body must invalidate old metrics')
  await (await workspaceField(page, 'Request count', { exact: true })).fill('100')
  assert.equal(await result('Stress test metrics').count(), 0)
  await page.getByRole('button', { name: 'Start stress test', exact: true }).click()
  await result('Stress test metrics').waitFor()
  assert.equal(await page.getByRole('textbox', { name: 'Body content', exact: true }).getAttribute('aria-readonly'), 'true', 'The request body must be locked while the test runs')
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await result('Stress test metrics').filter({ hasText: 'Stopped' }).waitFor()
  await page.getByRole('button', { name: 'Start stress test', exact: true }).click()
  await result('Stress test metrics').waitFor()
  const beforeStop = calls.filter(value => value.kind === 'stop').length
  await page.locator('header').getByRole('link', { name: 'All tools', exact: true }).click()
  await page.getByRole('heading', { name: 'Developer workflows', exact: true }).waitFor()
  await page.waitForTimeout(100)
  assert.ok(calls.filter(value => value.kind === 'stop').length > beforeStop)
  assert.equal(await page.evaluate(() => window.__testingFixture.listeners.size), 0)
  await page.evaluate(() => { window.location.hash = '/tool/hacking.stress' }); await ready('hacking.stress')
  assert.equal(await workspaceValue(page, 'HTTP method'), 'GET')
  assert.equal(await result('Stress test metrics').count(), 0)
  console.log('PASS request composer, redacted stress metrics, Stop, navigation cancellation, subscription cleanup and cleared request inputs (network fixture)')
  await open('hacking.headers'); await page.getByRole('button', { name: 'Check security headers', exact: true }).click(); await result('Security header findings').waitFor()
  await open('hacking.cors'); await (await workspaceField(page, 'Preflight method', { exact: true })).selectOption('DELETE'); await page.getByRole('button', { name: 'Probe CORS policy', exact: true }).click(); await result('CORS findings').waitFor()
  assert.equal(calls.findLast(value => value.kind === 'cors').input.method, 'DELETE')
  await open('hacking.jwt'); await page.getByRole('button', { name: 'Load unsigned example', exact: true }).click(); await page.getByRole('button', { name: 'Review JWT policy', exact: true }).click(); await result('JWT policy findings').waitFor()
  assert.match(await result('JWT policy findings').innerText(), /Signature NOT verified/)
  assert.match(await result('JWT policy findings').innerText(), /unsigned/)
  assert.doesNotMatch(await copy('Copy report'), /synthetic-demo|1700000000/)
  assert.doesNotMatch(await page.evaluate(() => JSON.stringify(localStorage)), /private-stress|900150983|synthetic-demo/)
  assert.deepEqual(errors, []); assert.deepEqual(external, [])
  console.log('PASS header/CORS UI fixtures, offline JWT review, no private persistence, no external network and no renderer errors')
} finally { await browser.close(); await new Promise(done => server.close(done)) }
