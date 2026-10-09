import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import assert from 'node:assert/strict'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = resolve('out/renderer')
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }
const html = await readFile(resolve(root, 'index.html'), 'utf8')
assert.match(html, /media-src 'self' blob:;/)
assert.doesNotMatch(html, /media-src[^;]*(?:https?:|data:|\*)/)
const server = createServer(async (request, response) => {
  try {
    const path = resolve(root, '.' + new URL(request.url, 'http://localhost').pathname)
    if (!path.startsWith(root + sep)) { response.writeHead(403).end(); return }
    response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' }).end(await readFile(path))
  } catch { response.writeHead(404).end() }
})
await new Promise(done => server.listen(0, '127.0.0.1', done))
const browser = await chromium.launch({ channel: process.env.UX_BROWSER_CHANNEL || undefined, headless: true })
const page = await browser.newPage({ viewport: { width: 1180, height: 760 } })
page.setDefaultTimeout(12000)
const errors = []
page.on('pageerror', error => errors.push(error.message))
await page.addInitScript(() => {
  const vault = { id: 'media-box', name: 'Media fixture', mode: 'device', rootPath: 'fixture-only', createdAt: '2026-10-09T00:00:00Z' }
  const state = window.__mediaFixture = { docs: [], violations: [], revoked: [] }
  const revoke = URL.revokeObjectURL.bind(URL)
  URL.revokeObjectURL = value => { state.revoked.push(value); revoke(value) }
  document.addEventListener('securitypolicyviolation', event => state.violations.push({ directive: event.effectiveDirective, uri: event.blockedURI }))
  window.devutils = {
    platform: async () => 'win32', app: { onOpenTool: () => () => {}, trayAvailable: async () => true, language: async () => ({ language: 'en', resolved: 'en' }) },
    privateBox: {
      getStatus: async () => ({ configured: true, hasAccess: true, mode: 'device', rootPath: vault.rootPath, activeId: vault.id, vaults: [vault], sessionId: 'media-session' }),
      list: async () => state.docs.map(doc => ({ ...doc, kind: 'file' })),
      readFile: async path => ({ ...state.docs.find(doc => doc.relativePath === path) }),
      clearAccess: async () => {}
    }
  }
})
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html#/`)
  await page.evaluate(async () => {
    const samples = 8000, bytes = new Uint8Array(44 + samples * 2), view = new DataView(bytes.buffer)
    const text = (offset, value) => [...value].forEach((letter, index) => { bytes[offset + index] = letter.charCodeAt(0) })
    text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVE'); text(12, 'fmt ')
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
    view.setUint32(24, 8000, true); view.setUint32(28, 16000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
    text(36, 'data'); view.setUint32(40, samples * 2, true)
    const base64 = array => btoa([...array].map(value => String.fromCharCode(value)).join(''))
    const common = { encoding: 'base64', updatedAt: '2026-10-09T00:00:00Z', sessionId: 'media-session' }
    window.__mediaFixture.docs.push({ ...common, id: 'audio', name: 'Fixture.wav', type: 'audio', mimeType: 'audio/wav', content: base64(bytes), relativePath: 'audio.putl' })
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32
    const stream = canvas.captureStream(15), recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' }), chunks = []
    const recorded = new Promise(done => { recorder.ondataavailable = event => chunks.push(event.data); recorder.onstop = done })
    recorder.start()
    const drawing = setInterval(() => { const context = canvas.getContext('2d'); context.fillStyle = '#336699'; context.fillRect(0, 0, 32, 32) }, 40)
    await new Promise(done => setTimeout(done, 400)); recorder.stop(); await recorded; clearInterval(drawing); stream.getTracks().forEach(track => track.stop())
    const blob = new Blob(chunks, { type: 'video/webm' })
    window.__mediaFixture.docs.push({ ...common, id: 'video', name: 'Fixture.webm', type: 'video', mimeType: 'video/webm', content: base64(new Uint8Array(await blob.arrayBuffer())), relativePath: 'video.putl' })
    location.hash = '/tool/privatebox.home'
  })
  for (const [name, selector] of [['Fixture.wav', 'audio'], ['Fixture.webm', 'video']]) {
    await page.getByRole('button', { name, exact: true }).dblclick()
    const media = page.locator(selector)
    await media.waitFor()
    await media.evaluate(async element => { await element.play() })
    await page.waitForFunction(selector => document.querySelector(selector)?.currentTime > 0, selector)
    assert.equal(await media.evaluate(element => element.error), null)
    const source = await media.getAttribute('src')
    assert.match(source, /^blob:/)
    await page.getByTitle('Close', { exact: true }).last().click()
    await page.waitForFunction(source => window.__mediaFixture.revoked.includes(source), source)
  }
  assert.deepEqual(await page.evaluate(() => window.__mediaFixture.violations), [])
  assert.deepEqual(errors, [])
  console.log('PASS actual WAV/WebM blob playback under production CSP, URLs revoked on close, no network media allowance')
} finally { await browser.close(); await new Promise(done => server.close(done)) }
