import { createServer } from 'node:http'
import { readFile, mkdir, readdir } from 'node:fs/promises'
import { resolve, extname, sep, join } from 'node:path'
import assert from 'node:assert/strict'
import ts from 'typescript'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const rows = []
for (const file of (await readdir('src/shared/i18n')).filter(file => file.endsWith('.ts')).sort()) {
  const ast = ts.createSourceFile(file, await readFile(`src/shared/i18n/${file}`, 'utf8'), ts.ScriptTarget.Latest, true)
  const visit = node => { if (ts.isArrayLiteralExpression(node) && node.elements.length === 13 && node.elements.every(ts.isStringLiteral)) rows.push(node.elements.map(value => value.text)); ts.forEachChild(node, visit) }
  visit(ast)
}
const languages = ['en', 'zh', 'es', 'fr', 'de', 'ja', 'ko', 'pt', 'ru', 'ar', 'hi', 'id', 'vi']
assert.equal(new Set(rows.map(row => row[0])).size, rows.length, 'Source messages must be unique')
for (const row of rows) assert.ok(row.every(value => value.trim()), 'Every catalog row must have 13 non-empty values')
const text = (language, key) => language === 'en' ? key : rows.find(row => row[0] === key)?.[languages.indexOf(language)] ?? key
const translated = (language, key, values = {}) => {
  const row = rows.find(row => row[0] === key)
  assert.ok(row, `Missing expected translation row: ${key}`)
  return (language === 'en' ? key : row[languages.indexOf(language)]).replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (marker, key) => Object.hasOwn(values, key) ? String(values[key]) : marker)
}
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
  const fixture = window.__i18nFixture = {
    vaultView: 'setup', keepAccess: false, copied: '', setupCalls: [], unlockCalls: [], savedNotes: [],
    folderPath: 'C:/i18n-fixture/Home Settings 日本語', vaultName: 'Home Settings العربية 日本語'
  }
  window.__deferLanguageReply = false
  window.__trayLanguage = async value => { const state = await window.__saveLanguage(value); for (const listener of listeners) listener(state) }
  window.devutils = { platform: async () => 'win32', version: async () => '0.1.0-fixture', app: {
    language: () => window.__language(), setLanguage: async value => { const state = await window.__saveLanguage(value); for (const listener of listeners) listener(state); if (window.__deferLanguageReply) await new Promise(resolve => { window.__releaseLanguageReply = resolve }); return state },
    onLanguageChanged: callback => { listeners.add(callback); return () => listeners.delete(callback) }, onOpenTool: () => () => {}, trayAvailable: async () => true, quit: async () => {}
  }, security: { state: async () => ({ idleMinutes: 15, lastLock: null, hasDraft: false }), onVaultLocked: () => () => {}, recoverDraft: async () => null },
  privateBox: {
    getStatus: async () => fixture.vaultView === 'setup'
      ? { configured: false, hasAccess: false, mode: null, rootPath: null, activeId: null, vaults: [] }
      : { configured: true, hasAccess: true, mode: 'portable', rootPath: fixture.folderPath, activeId: 'i18n-vault', sessionId: 'i18n-session', vaults: [{ id: 'i18n-vault', name: fixture.vaultName, rootPath: fixture.folderPath, mode: 'portable', createdAt: '2026-10-09T00:00:00Z' }] },
    pickEmptyFolder: async () => fixture.folderPath, pickVaultFolder: async () => null,
    setup: async value => { fixture.setupCalls.push(value) }, clearAccess: async () => { fixture.keepAccess = false },
    list: async () => [], ensureDefault: async () => ({ id: 'i18n-default' }),
    prepareDefaultForSave: async () => ({ boxId: 'i18n-default', hasAccess: fixture.keepAccess, sessionId: fixture.keepAccess ? 'i18n-keep-session' : null }),
    accessDefault: async password => { fixture.unlockCalls.push(password); fixture.keepAccess = true; return 'i18n-keep-session' },
    mkdir: async () => {}, listKeepNotes: async () => ({ notes: [], unreadable: [], nextCursor: null }),
    saveDocument: async value => { fixture.savedNotes.push(value); throw new Error('Fixture should not save a note') }
  } }
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { fixture.copied = value } } })
})
page.on('pageerror', error => errors.push(error.message))
await page.route('**/*', route => { if (new URL(route.request().url()).origin === url) return route.continue(); external.push(route.request().url()); return route.abort() })
const ready = id => page.locator(`[data-tool-ready="${id}"]`).waitFor()
const openTool = async id => { await page.evaluate(id => { location.hash = `/tool/${id}` }, id); await ready(id) }
const changeLanguage = language => page.evaluate(value => window.__trayLanguage(value), language)
const workspace = page.locator('#workspace')
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
  await page.locator('#home-tool-search').fill('ham bam')
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

  await page.setViewportSize({ width: 1180, height: 760 })
  await openTool('app.about')
  for (const language of languages) {
    await changeLanguage(language)
    await workspace.getByRole('heading', { name: translated(language, 'Encryption and recovery'), exact: true }).waitFor()
    for (const key of [
      'No account sign-in or background telemetry. HTTP, DNS and TCP probes use the network only when you run them.',
      'An encrypted backup cannot recover a forgotten password.',
      'Private Box uses dual-layer AES-GCM. Device mode uses a key tied to the device; changes to hardware, the operating system or the user account can affect access. Portable mode uses two passwords you choose.',
      'Supported tools retain input and session history in memory until the window closes or reloads. Clear them in Settings. Security, vault, SSH, HTTP, Mock API, URL, QR, OCR and screen-color tools exclude their input from this history.'
    ]) await workspace.getByText(translated(language, key), { exact: true }).waitFor()
    assert.equal(await workspace.evaluate(element => element.scrollWidth <= element.clientWidth), true, `${language} About overflow`)
  }
  console.log('PASS 13-language About privacy, recovery and retention paragraphs')

  await changeLanguage('en')
  await openTool('convert.file-ext')
  const conversionPayload = '{"Home":"Settings","body":"Keep 日本語 العربية Tiếng Việt","number":123,"enabled":true}'
  const conversionEditor = workspace.locator('.cm-content[contenteditable="true"]').first()
  await conversionEditor.fill(conversionPayload)
  const converted = workspace.locator('.cm-content').nth(1)
  await page.waitForFunction(() => document.querySelectorAll('#workspace .cm-content')[1]?.textContent.includes('Keep 日本語 العربية Tiếng Việt'))
  const conversionOutput = (await converted.locator('.cm-line').allTextContents()).join('\n')
  assert.match(conversionOutput, /Home: Settings/)
  assert.match(conversionOutput, /number: 123/)
  for (const language of languages) {
    await changeLanguage(language)
    await workspace.getByRole('textbox', { name: translated(language, '{label} input', { label: 'JSON' }), exact: true }).waitFor()
    assert.equal(await workspace.getByRole('combobox', { name: translated(language, 'From') }).inputValue(), 'json')
    assert.equal(await workspace.getByRole('combobox', { name: translated(language, 'To') }).inputValue(), 'yaml')
    await workspace.getByRole('button', { name: translated(language, 'Swap'), exact: true }).waitFor()
    await workspace.getByText(translated(language, 'Extensible format hub · more formats later'), { exact: true }).waitFor()
    assert.equal(await conversionEditor.innerText(), conversionPayload, `${language} changed conversion input`)
    assert.equal((await converted.locator('.cm-line').allTextContents()).join('\n'), conversionOutput, `${language} translated converted data`)
  }
  await workspace.getByRole('button', { name: translated('vi', 'Copy output'), exact: true }).click()
  assert.equal(await page.evaluate(() => window.__i18nFixture.copied), conversionOutput, 'Copy must preserve the converted data')
  console.log('PASS 13-language data conversion controls preserve JSON input, YAML output and copied data')

  await changeLanguage('en')
  await openTool('sql.studio')
  const sqlPayload = "SELECT 'Home Settings 日本語 العربية' AS fixture_label, 123 AS fixture_number;"
  const sqlEditor = workspace.locator('.cm-content[contenteditable="true"]').first()
  await sqlEditor.fill(sqlPayload)
  await page.waitForFunction(name => [...document.querySelectorAll('#workspace button')].some(button => button.textContent.trim() === name && !button.disabled), translated('en', 'Format'))
  await workspace.getByRole('combobox', { name: translated('en', 'Indent') }).selectOption('4')
  await workspace.getByRole('checkbox', { name: translated('en', 'Uppercase keywords'), exact: true }).uncheck()
  for (const language of languages) {
    await changeLanguage(language)
    await workspace.getByRole('textbox', { name: translated(language, '{dialect} input', { dialect: 'MySQL' }), exact: true }).waitFor()
    assert.equal(await workspace.getByRole('combobox', { name: translated(language, 'Dialect') }).inputValue(), 'mysql')
    await workspace.getByRole('button', { name: translated(language, 'Minify'), exact: true }).waitFor()
    await workspace.getByRole('status').filter({ hasText: translated(language, 'Syntax checked') }).first().waitFor()
    assert.equal(await workspace.getByRole('combobox', { name: translated(language, 'Indent') }).inputValue(), '4')
    assert.equal(await workspace.getByRole('checkbox', { name: translated(language, 'Uppercase keywords'), exact: true }).isChecked(), false)
    assert.equal(await sqlEditor.innerText(), sqlPayload, `${language} changed SQL source`)
  }
  console.log('PASS 13-language SQL editor labels, options and validation status preserve SQL source')

  await changeLanguage('en')
  await openTool('privatebox.home')
  const boxName = 'Home Settings العربية 日本語'
  await workspace.getByRole('button', { name: translated('en', 'Select empty folder…'), exact: true }).click()
  await workspace.getByLabel(translated('en', 'Box name (optional)'), { exact: true }).fill(boxName)
  for (const language of languages) {
    await changeLanguage(language)
    await workspace.getByRole('heading', { name: translated(language, 'Set up Private Box'), exact: true }).waitFor()
    await workspace.getByRole('button', { name: translated(language, 'Add existing folder…'), exact: true }).waitFor()
    assert.equal(await workspace.getByLabel(translated(language, 'Box name (optional)'), { exact: true }).inputValue(), boxName)
    assert.equal(await workspace.getByRole('button', { name: 'C:/i18n-fixture/Home Settings 日本語', exact: true }).count(), 1, 'Folder paths must stay unchanged')
  }
  await changeLanguage('en')
  await workspace.getByRole('button', { name: translated('en', 'Continue'), exact: true }).click()
  for (const language of languages) {
    await changeLanguage(language)
    await workspace.getByText(translated(language, 'Device secret + your password. Files cannot open on another machine.'), { exact: true }).waitFor()
    await workspace.getByText(translated(language, 'You set two keys. Copy the folder to Mac/Windows/Linux and unlock with the same keys.'), { exact: true }).waitFor()
  }
  await changeLanguage('en')
  await workspace.getByRole('button', { name: translated('en', 'Continue'), exact: true }).click()
  const keys = { 'Key A': 'Fixture Home Settings key A', 'Confirm Key A': 'Fixture Home Settings key A', 'Key B': 'Fixture 日本語 key B', 'Confirm Key B': 'Fixture 日本語 key B' }
  for (const [label, value] of Object.entries(keys)) await workspace.getByLabel(translated('en', label), { exact: true }).fill(value)
  for (const language of languages) {
    await changeLanguage(language)
    await workspace.getByRole('button', { name: translated(language, 'Create Private Box'), exact: true }).waitFor()
    await workspace.getByText(translated(language, 'Store both keys safely. There is no recovery if you lose them.'), { exact: true }).waitFor()
    for (const [label, value] of Object.entries(keys)) assert.equal(await workspace.getByLabel(translated(language, label), { exact: true }).inputValue(), value, `${language} changed ${label}`)
  }
  assert.equal(await page.evaluate(() => window.__i18nFixture.setupCalls.length), 0, 'Language changes must not create a vault')
  await openTool('app.about')
  await page.evaluate(() => { window.__i18nFixture.vaultView = 'empty' })
  await openTool('privatebox.home')
  for (const language of languages) {
    await changeLanguage(language)
    await workspace.getByText(translated(language, 'This folder is empty'), { exact: true }).waitFor()
    await workspace.getByRole('button', { name: translated(language, 'New box'), exact: true }).waitFor()
    assert.equal(await workspace.getByText(boxName, { exact: true }).count(), 1, 'Vault names must stay unchanged')
    const files = workspace.getByRole('group', { name: translated(language, 'Private Box files'), exact: true })
    await files.press('Shift+F10')
    await page.getByRole('menu').getByText(translated(language, 'New Folder'), { exact: true }).waitFor()
    await page.getByRole('menu').press('Escape')
  }
  await changeLanguage('en')
  await workspace.getByRole('group', { name: translated('en', 'Private Box files'), exact: true }).press('Shift+F10')
  await page.getByRole('menu').getByText(translated('en', 'New Folder'), { exact: true }).click()
  const newFolder = 'Home Settings Tiếng Việt 日本語'
  await page.getByRole('dialog').getByRole('textbox').fill(newFolder)
  for (const language of languages) {
    await changeLanguage(language)
    const dialog = page.getByRole('dialog', { name: translated(language, 'New folder'), exact: true })
    await dialog.waitFor()
    await dialog.getByRole('button', { name: translated(language, 'Create'), exact: true }).waitFor()
    await dialog.getByRole('button', { name: translated(language, 'Cancel'), exact: true }).waitFor()
    assert.equal(await dialog.getByRole('textbox').inputValue(), newFolder, `${language} changed the folder name`)
  }
  await page.getByRole('dialog').getByRole('button', { name: translated('vi', 'Cancel'), exact: true }).click()
  console.log('PASS 13-language Private Box setup, key fields, empty state and folder actions preserve names, paths and keys')

  await changeLanguage('en')
  await openTool('privatebox.keep')
  const keepPassword = 'Fixture Home Settings العربية password'
  await workspace.getByLabel(translated('en', 'Keep password'), { exact: true }).fill(keepPassword)
  for (const language of languages) {
    await changeLanguage(language)
    await workspace.getByRole('button', { name: translated(language, 'Open Keep'), exact: true }).waitFor()
    await workspace.getByText(translated(language, 'Notes are sealed in your local Default Secret Box. Device key is automatic; enter your password (key B) to open.'), { exact: true }).waitFor()
    assert.equal(await workspace.getByLabel(translated(language, 'Keep password'), { exact: true }).inputValue(), keepPassword, `${language} changed Keep password`)
  }
  await changeLanguage('en')
  await workspace.getByRole('button', { name: translated('en', 'Open Keep'), exact: true }).click()
  for (const language of languages) {
    await changeLanguage(language)
    await workspace.getByText(translated(language, 'No notes yet — take one above'), { exact: true }).waitFor()
    await workspace.getByRole('button', { name: translated(language, 'Take a note…'), exact: true }).waitFor()
    await workspace.getByLabel(translated(language, 'Search notes by title or body'), { exact: true }).waitFor()
  }
  await changeLanguage('en')
  await workspace.getByRole('button', { name: translated('en', 'Take a note…'), exact: true }).click()
  const noteTitle = 'Home Settings 日本語', noteBody = 'Keep this fixture text: Input Output Save العربية Tiếng Việt'
  await workspace.getByLabel(translated('en', 'Note title'), { exact: true }).fill(noteTitle)
  await workspace.getByLabel(translated('en', 'Note body'), { exact: true }).fill(noteBody)
  for (const language of languages) {
    await changeLanguage(language)
    await workspace.getByRole('button', { name: translated(language, 'Save note'), exact: true }).waitFor()
    await workspace.getByRole('button', { name: translated(language, 'Pin note'), exact: true }).waitFor()
    assert.equal(await workspace.getByLabel(translated(language, 'Note title'), { exact: true }).inputValue(), noteTitle, `${language} changed note title`)
    assert.equal(await workspace.getByLabel(translated(language, 'Note body'), { exact: true }).inputValue(), noteBody, `${language} translated note contents`)
  }
  assert.deepEqual(await page.evaluate(() => window.__i18nFixture.unlockCalls), [keepPassword])
  assert.equal(await page.evaluate(() => window.__i18nFixture.savedNotes.length), 0, 'Language changes must not save plaintext note content')
  console.log('PASS 13-language Keep unlock, empty state and composer actions preserve passwords and unsaved note data')
  assert.deepEqual(errors, []); assert.deepEqual(external, [])
  console.log('PASS tray language events preserve live JSON input; translated accent-insensitive search; localized consent + Arabic hash worker; no external network or page crashes')
} catch (error) {
  console.error('I18N SMOKE FAILED', errors, await page.locator('body').innerText())
  throw error
} finally { await browser.close(); await new Promise(done => server.close(done)) }
