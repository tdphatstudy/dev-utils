// Render the repository-owned vector masters. Requires an available Playwright
// installation (PLAYWRIGHT_MODULE may be a module URL); no source image outside
// the repository is used. Run scripts/fix-icons.py afterwards for Windows ICOs.
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ channel: process.env.UX_BROWSER_CHANNEL || undefined, headless: true })
const page = await browser.newPage({ deviceScaleFactor: 1 })
try {
  const logo = await readFile(resolve(root, 'src/renderer/src/assets/logo.svg'), 'utf8')
  const tray = await readFile(resolve(root, 'resources/trayTemplate.svg'), 'utf8')
  const jobs = [
    ['src/renderer/src/assets/logo.png', 256, logo],
    ['src/renderer/src/assets/logo-fullbleed.png', 256, logo],
    ['src/renderer/public/logo.png', 256, logo],
    ['src/renderer/public/favicon.png', 64, logo],
    ['resources/icon.png', 1024, logo],
    ['resources/icon-512.png', 512, logo],
    ['resources/icon-256.png', 256, logo],
    ['resources/tray.png', 32, logo],
    ['resources/trayTemplate.png', 16, tray],
    ['resources/trayTemplate@2x.png', 32, tray]
  ]
  for (const [target, size, svg] of jobs) {
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`)
    const bytes = await page.screenshot({ omitBackground: true })
    await writeFile(resolve(root, target), bytes)
    console.log(`Rendered ${target} (${size}px)`)
  }
} finally { await browser.close() }
