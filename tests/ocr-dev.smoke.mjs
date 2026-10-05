import { createServer, loadConfigFromFile } from 'vite'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const loaded = await loadConfigFromFile({ command: 'serve', mode: 'development' }, resolve('electron.vite.config.ts'))
const server = await createServer({ ...loaded.config.renderer, configFile: false, root: resolve('src/renderer'), server: { host: '127.0.0.1', port: 0 } })
await server.listen()
const url = server.resolvedUrls.local[0]
const browser = await chromium.launch({ channel: process.env.UX_BROWSER_CHANNEL || undefined, headless: true })
try {
  const page = await browser.newPage()
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(url).origin ? route.continue() : route.abort())
  await page.addInitScript(() => {
    window.__ocr = { result: null, error: null }
    window.ocrHelper = {
      view: async () => {
        const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 150
        const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 1000, 150); ctx.fillStyle = 'black'; ctx.font = '48px Arial'; ctx.fillText('DevFusion development OCR 123', 20, 80)
        const blob = await new Promise(ok => canvas.toBlob(ok))
        return { kind: 'run', input: { kind: 'image', language: 'eng', bytes: new Uint8Array(await blob.arrayBuffer()) } }
      },
      ready: async () => {}, progress: async () => {}, close: async () => {},
      complete: async result => { window.__ocr.result = result }, fail: async error => { window.__ocr.error = error }
    }
  })
  await page.goto(new URL('ocr.html', url).href)
  await page.waitForFunction(() => window.__ocr.result || window.__ocr.error, { timeout: 60000 })
  const state = await page.evaluate(() => window.__ocr)
  assert.equal(state.error, null)
  assert.match(state.result.text, /DevFusion development OCR 123/)
  console.log('PASS Vite development OCR worker/core/model served locally; external requests blocked')
} finally { await browser.close(); await server.close() }
