import { createServer } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { createHmac } from 'node:crypto'
import assert from 'node:assert/strict'

// Isolated production renderer, sample-only crypto operations and clipboard.
// This verifies the UI does not publish an outdated operation or persist keys.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = resolve('out/renderer')
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname
    const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname))
    if (!path.startsWith(root + sep)) { response.writeHead(403).end(); return }
    response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' }).end(await readFile(path))
  } catch { response.writeHead(404).end() }
})
const browser = await chromium.launch({ channel: process.env.UX_BROWSER_CHANNEL || undefined, headless: true })
await new Promise((done) => server.listen(0, '127.0.0.1', done))
const url = `http://127.0.0.1:${server.address().port}`
const page = await browser.newPage({ viewport: { width: 720, height: 500 } })
page.setDefaultTimeout(15000)
const errors = [], report = { layouts: [] }
page.on('pageerror', (error) => errors.push(error.message))
await page.route('**/*', (route) => new URL(route.request().url()).origin === url ? route.continue() : route.abort())
await page.addInitScript(() => {
  window.__cryptoClipboard = []
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => {
    if (window.__cryptoCopyFailure) throw new Error('Fixture clipboard unavailable')
    window.__cryptoClipboard.push(text)
  } } })
  for (const name of ['sign', 'encrypt']) {
    const actual = crypto.subtle[name].bind(crypto.subtle)
    Object.defineProperty(crypto.subtle, name, { configurable: true, value: async (...args) => {
      if (window.__cryptoGate === name) {
        window.__cryptoGate = null
        await new Promise((release) => { window.__releaseCrypto = release })
      }
      return actual(...args)
    } })
  }
})
const screenshot = async (name) => {
  if (!process.env.BRAND_SCREENSHOT_DIR) return
  await mkdir(process.env.BRAND_SCREENSHOT_DIR, { recursive: true })
  await page.screenshot({ path: join(process.env.BRAND_SCREENSHOT_DIR, name + '.png'), animations: 'disabled' })
}
const open = async (tool, theme = 'light', width = 720) => {
  await page.setViewportSize({ width, height: 500 })
  await page.goto(url + '/#/tool/security.' + tool)
  await page.locator('.cm-content').first().waitFor()
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
  await page.evaluate((theme) => localStorage.setItem('devutils-app', JSON.stringify({ state: { theme, sidebarCollapsed: false, launchMode: 'home', recentToolIds: [] }, version: 0 })), theme)
  await page.reload()
  await page.locator('.cm-content').first().waitFor()
  await page.locator('[data-loading-state]').waitFor({ state: 'hidden' })
  await page.waitForTimeout(250) // Let the sidebar resize finish before measuring layout.
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).colorScheme), theme)
}
const text = (label) => page.getByLabel(label, { exact: true }).evaluate((element) => element.querySelector('.cm-placeholder') ? '' : [...element.querySelectorAll('.cm-line')].map((line) => line.textContent).join('\n'))
const waitText = async (label, expected) => page.waitForFunction(({ label, expected }) => {
  const element = [...document.querySelectorAll('.cm-content')].find((element) => element.getAttribute('aria-label') === label)
  const value = element && !element.querySelector('.cm-placeholder') ? [...element.querySelectorAll('.cm-line')].map((line) => line.textContent).join('\n') : ''
  return value === expected
}, { label, expected })
const editor = (label) => page.getByLabel(label, { exact: true })
const tab = (name) => page.getByRole('tab', { name, exact: true })
const status = (value) => page.getByRole('status').filter({ hasText: value })
const measure = async (tool, theme, width) => {
  const bounds = await page.evaluate(() => ({
    toolbarHeight: Math.round(document.querySelector('.mac-tool-toolbar').getBoundingClientRect().height),
    workspaceWidth: Math.round(document.querySelector('#workspace').getBoundingClientRect().width),
    editors: [...document.querySelectorAll('.cm-content')].map((element) => {
      const box = element.closest('.cm-editor').getBoundingClientRect()
      return { label: element.getAttribute('aria-label'), visible: Boolean(element.getClientRects().length), width: Math.round(box.width), height: Math.round(box.height), top: Math.round(box.top), bottom: Math.round(box.bottom) }
    })
  }))
  report.layouts.push({ tool, theme, width, ...bounds })
}
const reachable = async (locator) => {
  const box = await locator.boundingBox()
  assert.ok(box && box.width > 0 && box.height > 0 && box.x >= 0 && box.x + box.width <= page.viewportSize().width + 1 && box.y >= 48 && box.y + box.height <= page.viewportSize().height + 1, 'Control or output is not reachable in the desktop viewport')
}
const assertEditor = async (label) => {
  await reachable(editor(label))
  const height = await editor(label).evaluate((element) => element.closest('.cm-editor').clientHeight)
  assert.ok(height >= 90, `${label} editor height ${height} is below 90`)
}
const noPersistedPayload = async () => {
  const persisted = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))
  for (const sensitive of ['fixture-password-291', 'fixture-hmac-key-742', 'fixture-private-message-852']) assert.ok(!persisted.includes(sensitive), 'Crypto payload was persisted')
}
try {
  if (process.env.UX_CRYPTO_BASELINE) {
    for (const width of [720, 900]) for (const tool of ['aes', 'hmac']) {
      await open(tool, 'light', width)
      await measure(tool + '-before', 'light', width)
      await screenshot(`ux-crypto-${tool}-before-${width}`)
    }
  } else {
    await open('aes')
    assert.equal(await tab('Input').getAttribute('aria-selected'), 'true')
    await measure('aes-current', 'light',720)
    console.log(JSON.stringify(report.layouts.at(-1)))
    await screenshot('ux-crypto-aes-current-light-720')
    await assertEditor('Plaintext (UTF-8)')
    const password = page.getByLabel('Password', { exact: true })
    await password.focus()
    await page.getByRole('button', { name: 'Show password', exact: true }).focus()
    assert.equal(await password.getAttribute('aria-invalid'), 'true')
    assert.equal(await page.getByRole('button', { name: 'Encrypt text', exact: true }).isDisabled(), true)
    await password.fill('fixture-password-291')
    assert.equal(await password.getAttribute('aria-invalid'), 'false')
    await page.getByRole('button', { name: 'Show password', exact: true }).click()
    assert.equal(await password.getAttribute('type'), 'text')
    await page.getByRole('button', { name: 'Hide password', exact: true }).click()
    const message = 'fixture-private-message-852 🔒\nSecond line'
    await editor('Plaintext (UTF-8)').fill(message)
    await page.keyboard.press('Control+Enter')
    await status('Encrypted successfully').waitFor()
    assert.equal(await tab('Output').getAttribute('aria-selected'), 'true')
    await assertEditor('Encrypted output (Base64)')
    assert.equal(await tab('Output').evaluate((element) => element === document.activeElement), true)
    const encrypted = await text('Encrypted output (Base64)')
    assert.ok(Buffer.from(encrypted, 'base64').length > Buffer.byteLength(message))
    assert.equal(await editor('Encrypted output (Base64)').getAttribute('aria-readonly'), 'true')
    await page.getByRole('button', { name: 'Copy output', exact: true }).click()
    assert.equal(await page.evaluate(() => window.__cryptoClipboard.at(-1)), encrypted)
    await page.getByRole('button', { name: 'Use to decrypt', exact: true }).click()
    assert.equal(await tab('Input').getAttribute('aria-selected'), 'true')
    await waitText('DevFusion AES ciphertext (Base64)', encrypted)
    assert.equal(await tab('Input').evaluate((element) => element === document.activeElement), true)
    await page.getByRole('button', { name: 'Decrypt text', exact: true }).click()
    await status('Decrypted successfully').waitFor()
    await waitText('Decrypted plaintext', message)
    assert.equal(await editor('Decrypted plaintext').getAttribute('aria-readonly'), 'true')
    await noPersistedPayload()
    await tab('Input').click()
    await password.fill('wrong-password')
    await page.getByRole('button', { name: 'Decrypt text', exact: true }).click()
    await status('wrong password or corrupt data').first().waitFor()
    assert.equal(await editor('DevFusion AES ciphertext (Base64)').getAttribute('aria-invalid'), 'true')
    assert.equal(await page.getByRole('button', { name: 'Copy output', exact: true }).isDisabled(), true)
    await editor('DevFusion AES ciphertext (Base64)').fill('%%%bad')
    await page.getByRole('button', { name: 'Decrypt text', exact: true }).click()
    await status('wrong password or corrupt data').first().waitFor()
    await editor('DevFusion AES ciphertext (Base64)').fill('aGVsbG8=')
    await page.getByRole('button', { name: 'Decrypt text', exact: true }).click()
    await status('Ciphertext too short').first().waitFor()
    await page.getByRole('group', { name: 'AES operation', exact: true }).getByRole('button', { name: 'Encrypt', exact: true }).click()
    await password.fill('fixture-password-291')
    await editor('Plaintext (UTF-8)').fill('')
    await page.getByRole('button', { name: 'Encrypt text', exact: true }).click()
    await status('Encrypted successfully').waitFor()
    await page.getByRole('button', { name: 'Use to decrypt', exact: true }).click()
    await page.getByRole('button', { name: 'Decrypt text', exact: true }).click()
    await status('Decrypted successfully · empty plaintext').waitFor()
    assert.equal(await text('Decrypted plaintext'), '')
    assert.equal(await page.getByRole('button', { name: 'Use to encrypt', exact: true }).isEnabled(), true)
    await page.getByRole('button', { name: 'Use to encrypt', exact: true }).click()
    await editor('Plaintext (UTF-8)').fill('stale AES sample')
    await page.evaluate(() => { window.__cryptoGate = 'encrypt' })
    await page.getByRole('button', { name: 'Encrypt text', exact: true }).click()
    await page.waitForFunction(() => typeof window.__releaseCrypto === 'function')
    await editor('Plaintext (UTF-8)').fill('current AES sample')
    await page.getByRole('button', { name: 'Encrypt text', exact: true }).click()
    await status('Encrypted successfully').waitFor()
    const currentEncrypted = await text('Encrypted output (Base64)')
    await page.evaluate(() => { window.__releaseCrypto(); window.__releaseCrypto = null })
    await page.waitForTimeout(200)
    assert.equal(await text('Encrypted output (Base64)'), currentEncrypted)
    await page.getByRole('button', { name: 'Use to decrypt', exact: true }).click()
    await page.getByRole('button', { name: 'Decrypt text', exact: true }).click()
    await status('Decrypted successfully').waitFor()
    await waitText('Decrypted plaintext', 'current AES sample')
    console.log('PASS AES Unicode/empty round-trip, ciphertext errors, password ownership, stale operation and reachable output')

    await open('hmac')
    const key = page.getByLabel('Secret key (UTF-8 text)', { exact: true })
    assert.equal(await key.inputValue(), '')
    await key.focus()
    await page.getByRole('button', { name: 'Show secret key', exact: true }).focus()
    assert.equal(await key.getAttribute('aria-invalid'), 'true')
    await key.fill('fixture-hmac-key-742')
    await editor('HMAC message (UTF-8)').fill('fixture-private-message-852 🔒')
    await tab('Input').focus()
    await page.keyboard.press('ArrowRight')
    assert.equal(await tab('Output').getAttribute('aria-selected'), 'true')
    await assertEditor('HMAC-SHA-256 (Hex)')
    for (const algo of ['SHA-256', 'SHA-512', 'SHA-1']) for (const format of ['hex', 'base64']) {
      await page.getByRole('group', { name: 'HMAC options', exact: true }).getByRole('combobox').selectOption(algo)
      await page.getByRole('group', { name: 'HMAC output encoding', exact: true }).getByRole('button', { name: format === 'hex' ? 'Hex' : 'Base64', exact: true }).click()
      const expected = createHmac(algo.replace('-', '').toLowerCase(), 'fixture-hmac-key-742').update('fixture-private-message-852 🔒').digest(format)
      const label = `HMAC-${algo} (${format === 'hex' ? 'Hex' : 'Base64'})`
      await waitText(label, expected)
      assert.equal(await editor(label).getAttribute('aria-readonly'), 'true')
    }
    await page.getByRole('button', { name: 'Copy HMAC', exact: true }).click()
    const copied = await text('HMAC-SHA-1 (Base64)')
    assert.equal(await page.evaluate(() => window.__cryptoClipboard.at(-1)), copied)
    await page.evaluate(() => { window.__cryptoCopyFailure = true })
    await page.getByRole('button', { name: 'Copied', exact: true }).click()
    await page.getByRole('button', { name: 'Copy failed · retry', exact: true }).waitFor()
    await page.evaluate(() => { window.__cryptoCopyFailure = false })
    await page.getByRole('button', { name: 'Copy failed · retry', exact: true }).click()
    await noPersistedPayload()
    await tab('Input').click()
    await page.evaluate(() => { window.__cryptoGate = 'sign' })
    await editor('HMAC message (UTF-8)').fill('old HMAC message')
    await page.waitForFunction(() => typeof window.__releaseCrypto === 'function')
    assert.equal(await page.getByRole('button', { name: 'Copy HMAC', exact: true }).isDisabled(), true)
    await editor('HMAC message (UTF-8)').fill('current HMAC message')
    await tab('Output').click()
    const expected = createHmac('sha1', 'fixture-hmac-key-742').update('current HMAC message').digest('base64')
    await waitText('HMAC-SHA-1 (Base64)', expected)
    await page.evaluate(() => { window.__releaseCrypto(); window.__releaseCrypto = null })
    await page.waitForTimeout(200)
    assert.equal(await text('HMAC-SHA-1 (Base64)'), expected)
    await tab('Input').click()
    await editor('HMAC message (UTF-8)').fill('')
    await tab('Output').click()
    await waitText('HMAC-SHA-1 (Base64)', createHmac('sha1', 'fixture-hmac-key-742').update('').digest('base64'))
    await key.fill('')
    assert.equal(await key.getAttribute('aria-invalid'), 'true')
    assert.equal(await page.getByRole('button', { name: 'Copy HMAC', exact: true }).isDisabled(), true)
    await waitText('HMAC-SHA-1 (Base64)', '')
    await page.getByRole('link', { name: 'All tools', exact: true }).click()
    await page.getByRole('link', { name: 'HMAC', exact: true }).first().click()
    await key.waitFor()
    assert.equal(await key.inputValue(), '')
    assert.equal(await text('HMAC message (UTF-8)'), 'hello')
    console.log('PASS HMAC independent encodings, invalid key, stale result, clipboard retry and secret cleared on route exit')

    for (const theme of ['light', 'dark']) for (const width of [720, 900, 1200]) for (const tool of ['aes', 'hmac']) {
      await open(tool, theme, width)
      await measure(tool + '-after', theme, width)
      await reachable(page.getByRole('button', { name: tool === 'aes' ? 'Encrypt text' : 'Copy HMAC', exact: true }))
      if (width < 1100) {
        assert.equal(await tab('Input').count(), 1)
        await assertEditor(tool === 'aes' ? 'Plaintext (UTF-8)' : 'HMAC message (UTF-8)')
        await tab('Input').focus()
        await page.keyboard.press('End')
        assert.equal(await tab('Output').getAttribute('aria-selected'), 'true')
        await assertEditor(tool === 'aes' ? 'Encrypted output (Base64)' : 'HMAC-SHA-256 (Hex)')
      } else assert.equal(await tab('Input').count(), 0)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
      assert.equal(overflow, false)
      if (width === 720) await screenshot(`ux-crypto-${tool}-after-${theme}-${width}`)
    }
    console.log('PASS crypto tools workspace-width panes, keyboard tabs and reachable actions at720/900/1200×500 light/dark')
    for (const tool of ['aes', 'hmac']) {
      await open(tool)
      await page.setViewportSize({ width: 360, height: 250 })
      await page.waitForTimeout(250)
      const scroller = page.locator(`[data-tool-ready="security.${tool}"] > div`).first()
      assert.equal(await scroller.evaluate((element) => element.scrollHeight > element.clientHeight), true)
      await tab('Input').click()
      const label = tool === 'aes' ? 'Plaintext (UTF-8)' : 'HMAC message (UTF-8)'
      await editor(label).fill('short viewport fixture')
      assert.ok(await editor(label).evaluate((element) => element.closest('.cm-editor').clientHeight >= 64), 'Logical short viewport zeroed the editor')
      await tab('Input').focus()
      await page.keyboard.press('ArrowRight')
      assert.equal(await tab('Output').getAttribute('aria-selected'), 'true')
      const resultLabel = tool === 'aes' ? 'Encrypted output (Base64)' : 'HMAC-SHA-256 (Hex)'
      assert.ok(await editor(resultLabel).evaluate((element) => element.closest('.cm-editor').clientHeight >= 64), 'Logical short viewport zeroed output')
      await editor(resultLabel).scrollIntoViewIfNeeded()
      await reachable(editor(resultLabel))
      await measure(tool + '-logical-short', 'light',360)
      await screenshot(`ux-crypto-${tool}-logical-360-250`)
    }
    console.log('PASS crypto logical360×250 scroll escape preserves editable input and nonzero result pane')
  }
  assert.deepEqual(errors, [])
  if (process.env.BRAND_SCREENSHOT_DIR) await writeFile(join(process.env.BRAND_SCREENSHOT_DIR, process.env.UX_CRYPTO_BASELINE ? 'crypto-tools-baseline-results.json' : 'crypto-tools-results.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} finally { await browser.close(); await new Promise((done) => server.close(done)) }
