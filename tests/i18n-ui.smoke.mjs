import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve, extname, sep, join } from 'node:path'
import assert from 'node:assert/strict'
import ts from 'typescript'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const rows = []
for (const file of ['catalog', 'workspace-messages', 'settings-messages', 'tool-messages', 'analysis-messages', 'security-workspace-messages']) {
  const ast = ts.createSourceFile(file, await readFile(`src/shared/i18n/${file}.ts`, 'utf8'), ts.ScriptTarget.Latest, true)
  const visit = node => { if (ts.isArrayLiteralExpression(node) && node.elements.length === 13 && node.elements.every(ts.isStringLiteral)) rows.push(node.elements.map(value => value.text)); ts.forEachChild(node, visit) }
  visit(ast)
}
const languages = ['en', 'zh', 'es', 'fr', 'de', 'ja', 'ko', 'pt', 'ru', 'ar', 'hi', 'id', 'vi']
assert.equal(new Set(rows.map(row => row[0])).size, rows.length, 'Source messages must be unique')
for (const row of rows) assert.ok(row.every(value => value.trim()), 'Every catalog row must have 13 non-empty values')
const text = (language, key) => language === 'en' ? key : rows.find(row => row[0] === key)?.[languages.indexOf(language)] ?? key
const root = resolve('out/renderer'), mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname, path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname))
    if (!path.startsWith(root + sep)) { response.writeHead(403).end(); return }
    response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' }).end(await readFile(path))
  } catch { response.writeHead(404).end() }
})
await new Promise(done => server.listen(0, '127.0.0.1', done))
const url = `http://127.0.0.1:${server.address().port}`, browser = await chromium.launch({ channel: process.env.UX_BROWSER_CHANNEL || undefined, headless: true })
const page = await browser.newPage({ viewport: { width: 1180, height: 760 } }), errors = [], external = []
let setting = 'system', failSave = false
await page.exposeFunction('__language', () => ({ language: setting, resolved: setting === 'system' ? 'en' : setting }))
await page.exposeFunction('__saveLanguage', value => { if (failSave) { failSave = false; throw new Error('private fixture error') }; setting = value; return { language: setting, resolved: setting === 'system' ? 'en' : setting } })
await page.addInitScript(() => {
  const listeners = new Set()
  window.__deferLanguageReply = false
  window.__trayLanguage = async value => { const state = await window.__saveLanguage(value); for (const listener of listeners) listener(state) }
  window.devutils = { platform: async () => 'win32', app: {
    language: () => window.__language(), setLanguage: async value => { const state = await window.__saveLanguage(value); for (const listener of listeners) listener(state); if (window.__deferLanguageReply) await new Promise(resolve => { window.__releaseLanguageReply = resolve }); return state },
    onLanguageChanged: callback => { listeners.add(callback); return () => listeners.delete(callback) }, onOpenTool: () => () => {}, trayAvailable: async () => true, quit: async () => {}
  }, security: { state: async () => ({ idleMinutes: 15, lastLock: null, hasDraft: false }), onVaultLocked: () => () => {} } }
})
page.on('pageerror', error => errors.push(error.message))
await page.route('**/*', route => { if (new URL(route.request().url()).origin === url) return route.continue(); external.push(route.request().url()); return route.abort() })
const ready = id => page.locator(`[data-tool-ready="${id}"]`).waitFor()
const capture = async name => {
  if (!process.env.BRAND_SCREENSHOT_DIR) return
  await page.waitForFunction(() => [...document.querySelectorAll('.mac-page-enter')].every(element => Number(getComputedStyle(element).opacity) >= .99))
  await mkdir(process.env.BRAND_SCREENSHOT_DIR, { recursive: true })
  await page.screenshot({ path: join(process.env.BRAND_SCREENSHOT_DIR, `i18n-${name}.png`), animations: 'disabled' })
}
try {
  await page.goto(`${url}/#/tool/app.settings`); await ready('app.settings')
  assert.equal(await page.locator('[data-language-select] option').count(), 14)
  for (const language of languages) {
    await page.locator('[data-language-select]').selectOption(language)
    await page.locator('[data-language-select]:enabled').waitFor()
    await page.getByRole('heading', { name: text(language, 'Language'), exact: true }).waitFor()
    assert.equal(await page.locator('html').getAttribute('dir'), language === 'ar' ? 'rtl' : 'ltr')
    assert.equal(setting, language)
    for (const [width, height] of [[1180, 760], [720, 500]]) {
      await page.setViewportSize({ width, height })
      assert.equal(await page.locator('#workspace').evaluate(element => element.scrollWidth <= element.clientWidth), true, `${language} settings overflow`)
    }
    if (language === 'vi' || language === 'ar') await capture(`settings-${language}`)
  }
  await page.reload(); await ready('app.settings')
  assert.equal(await page.locator('[data-language-select]').inputValue(), 'vi')
  failSave = true
  await page.locator('[data-language-select]').selectOption('ja')
  await page.getByRole('alert').waitFor()
  assert.equal(await page.locator('[data-language-select]').inputValue(), 'vi')
  assert.equal(setting, 'vi')
  assert.equal((await page.getByRole('alert').innerText()).includes('private fixture error'), false)
  await page.evaluate(() => { window.__deferLanguageReply = true })
  await page.locator('[data-language-select]').selectOption('ja')
  await page.waitForFunction(() => typeof window.__releaseLanguageReply === 'function')
  await page.evaluate(async () => { await window.__trayLanguage('vi'); window.__deferLanguageReply = false; window.__releaseLanguageReply() })
  await page.locator('[data-language-select]:enabled').waitFor()
  assert.equal(await page.locator('[data-language-select]').inputValue(), 'vi', 'Late IPC response overwrote newer tray selection')
  console.log('PASS 13 languages + System, compact layouts, persisted reload and failed-write rollback')
  await page.evaluate(() => { location.hash = '/tool/json.studio' }); await ready('json.studio')
  const input = page.locator('.cm-content[contenteditable="true"]').first()
  const payload = '{"Home":"Settings","Input":"Tiếng Việt","constructor":true}'
  await input.fill(payload)
  for (const language of languages) {
    await page.evaluate(value => window.__trayLanguage(value), language)
    await page.getByRole('button', { name: text(language, 'How to use'), exact: true }).waitFor()
    assert.equal(await input.innerText(), payload, `${language} changed input`)
  }
  await page.getByRole('button', { name: text('vi', 'How to use'), exact: true }).click()
  await page.getByRole('region', { name: text('vi', 'Quick guide'), exact: true }).waitFor()
  assert.equal(await input.innerText(), payload)
  await capture('json-guide-vi')
  await page.evaluate(() => { location.hash = '/' })
  await page.locator('#home-tool-search').fill('phong thu')
  await page.locator('#home-category').selectOption('hacking')
  await page.getByRole('button', { name: text('vi', 'Hash Lab'), exact: true }).waitFor()
  await page.getByRole('button', { name: text('vi', 'Hash Lab'), exact: true }).click()
  await page.getByRole('heading', { name: text('vi', 'Security testing warning'), exact: true }).waitFor()
  await page.evaluate(() => window.__trayLanguage('ar'))
  await page.getByRole('heading', { name: text('ar', 'Security testing warning'), exact: true }).waitFor()
  assert.equal(await page.locator('[data-tool-ready]').count(), 0)
  await page.getByRole('button', { name: text('ar', 'Agree'), exact: true }).click(); await ready('hacking.hash')
  await page.getByLabel(text('ar', 'Input text'), { exact: true }).fill('abc')
  await page.getByRole('button', { name: text('ar', 'Generate hash'), exact: true }).click()
  await page.waitForFunction(() => document.body.textContent.includes('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'))
  assert.equal(await page.locator('#workspace').evaluate(element => element.scrollWidth <= element.clientWidth), true)
  await capture('hash-ar')
  await page.setViewportSize({ width: 1180, height: 760 })
  await page.evaluate(() => window.__trayLanguage('vi'))
  await page.getByLabel(text('vi', 'Hash operation'), { exact: true }).selectOption('search')
  await page.getByRole('button', { name: text('vi', 'Add common candidates'), exact: true }).click()
  await page.getByText(text('vi', 'Search plan'), { exact: false }).waitFor()
  await page.getByText(text('vi', 'Candidate variations'), { exact: true }).click()
  await page.getByRole('checkbox', { name: text('vi', 'Capitalize'), exact: true }).check()
  assert.equal(await page.getByRole('checkbox', { name: text('vi', 'Show attempted candidates on this screen only'), exact: true }).isChecked(), true)
  await capture('hash-candidates-vi')
  for (const language of languages) {
    await page.evaluate(value => window.__trayLanguage(value), language)
    await page.getByRole('button', { name: text(language, 'Add common candidates'), exact: true }).waitFor()
    assert.equal(await page.getByLabel(text(language, 'Candidate dictionary'), { exact: true }).innerText(), 'password\n123456\nadmin\nwelcome\nletmein\nqwerty\nchangeme\ntest\ndeveloper', 'Language must preserve candidate content')
  }
  await page.evaluate(() => { location.hash = '/tool/json.schema' }); await ready('json.schema')
  await page.evaluate(() => window.__trayLanguage('vi'))
  await page.getByRole('button', { name: text('vi', 'Load example'), exact: true }).click()
  await page.getByRole('button', { name: text('vi', 'Validate payload'), exact: true }).click()
  const schemaResult = page.getByRole('region', { name: text('vi', 'Validation results'), exact: true })
  await schemaResult.waitFor()
  assert.match(await schemaResult.getByRole('status').innerText(), /điểm chưa đáp ứng schema/)
  assert.equal(await schemaResult.getByRole('columnheader', { name: text('vi', 'Field pointer'), exact: true }).count(), 1)
  await capture('schema-vi')
  await page.evaluate(() => window.__trayLanguage('de'))
  await page.getByRole('region', { name: text('de', 'Validation results'), exact: true }).waitFor()
  const inputTab = page.getByRole('tab', { name: text('de', 'Input'), exact: true })
  if (await inputTab.isVisible()) await inputTab.click()
  assert.equal(await page.getByRole('textbox', { name: text('de', 'JSON Schema'), exact: true }).count(), 1, 'Language changes must retain the source editor')
  assert.match(await page.getByRole('textbox', { name: text('de', 'JSON Schema'), exact: true }).innerText(), /orderId/)
  assert.deepEqual(errors, []); assert.deepEqual(external, [])
  console.log('PASS tray language events preserve live JSON input; translated accent-insensitive search; localized consent + Arabic hash worker; no external network or page crashes')
} catch (error) {
  console.error('I18N SMOKE FAILED', errors, await page.locator('body').innerText())
  throw error
} finally { await browser.close(); await new Promise(done => server.close(done)) }
