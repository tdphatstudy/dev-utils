import { createServer } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import assert from 'node:assert/strict'

// Production renderer in an isolated, fixture-only browser profile. No real
// clipboard, vault, scheduler or background network operations are used.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = resolve('out/renderer')
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }
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
const page = await browser.newPage({ viewport: { width: 720, height: 500 }, timezoneId: 'America/New_York' })
page.setDefaultTimeout(15000)
const errors = [], report = { views: [] }
page.on('pageerror', (error) => errors.push(error.message))
await page.route('**/*', (route) => new URL(route.request().url()).origin === url ? route.continue() : route.abort())
await page.addInitScript(() => {
  window.__cronCopied = []
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value) => { window.__cronCopied.push(value) } } })
})
const screenshot = async (name) => {
  if (!process.env.BRAND_SCREENSHOT_DIR) return
  await mkdir(process.env.BRAND_SCREENSHOT_DIR, { recursive: true })
  await page.screenshot({ path: join(process.env.BRAND_SCREENSHOT_DIR, name + '.png'), animations: 'disabled' })
}
const open = async () => {
  await page.goto(url + '/#/tool/text.cron')
  await page.getByLabel('Expression', { exact: true }).waitFor()
}
const measure = async (name) => {
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
  const bounds = await page.evaluate(() => {
    const box = (element) => {
      if (!element) return null
      const { top, bottom, width, height } = element.getBoundingClientRect()
      return { top: Math.round(top), bottom: Math.round(bottom), width: Math.round(width), height: Math.round(height) }
    }
    return {
      viewport: { width: innerWidth, height: innerHeight },
      expression: box(document.querySelector('#cron-expression') || [...document.querySelectorAll('input')].find((element) => element.getAttribute('aria-describedby')?.includes('expression-hint'))),
      firstRun: box(document.querySelector('[data-cron-runs] li') || [...document.querySelectorAll('ol li')][0]),
      toolbarHeights: [...document.querySelectorAll('.mac-tool-toolbar')].map((element) => Math.round(element.getBoundingClientRect().height)),
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth
    }
  })
  report.views.push({ name, ...bounds })
  return bounds
}
try {
  await open()
  if (process.env.UX_CRON_BASELINE) {
    await measure('baseline-720x500')
    await screenshot('ux-cron-before-720')
    await page.setViewportSize({ width: 1180, height: 760 })
    await measure('baseline-1180x760')
    await screenshot('ux-cron-before-1180')
  } else {
    const expression = () => page.getByLabel('Expression', { exact: true })
    const start = () => page.getByLabel('Preview after · ISO date and time', { exact: true })
    const count = () => page.getByLabel('Run count', { exact: true })
    const zone = () => page.getByLabel('Schedule timezone', { exact: true })
    const tab = (name) => page.getByRole('tab', { name, exact: true })
    const summary = (name) => page.locator('summary').filter({ hasText: new RegExp('^' + name + '$') })
    const runs = () => page.locator('[data-cron-runs] li time')
    const preview = async () => { if (await tab('Upcoming runs').count()) await tab('Upcoming runs').click() }
    const schedule = async () => { if (await tab('Schedule').count()) await tab('Schedule').click() }
    const expectRuns = async (values) => {
      await page.waitForFunction((values) => JSON.stringify([...document.querySelectorAll('[data-cron-runs] li time')].map((element) => element.getAttribute('datetime'))) === JSON.stringify(values), values)
      assert.deepEqual(await runs().evaluateAll((elements) => elements.map((element) => element.getAttribute('datetime'))), values)
    }
    const noOverflow = async () => {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Cron document overflows horizontally')
      const panels = await page.locator('[data-split-pane] > div:not([hidden])').evaluateAll((elements) => elements.map((element) => ({ width: element.clientWidth, scrollWidth: element.scrollWidth })))
      assert.ok(panels.every(({ width, scrollWidth }) => scrollWidth <= width + 1), `Cron panel overflow: ${JSON.stringify(panels)}`)
    }
    const expectInvalidDescription = async (input, text) => {
      assert.equal(await input.getAttribute('aria-invalid'), 'true')
      const described = await input.evaluate((element) => (element.getAttribute('aria-describedby') || '').split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' '))
      assert.match(described, text)
    }
    assert.equal(await tab('Schedule').getAttribute('aria-selected'), 'true')
    await expression().fill('0 9 * * 1-5')
    await zone().selectOption('UTC')
    await count().fill('3')
    await start().fill('2026-10-05T09:00:00Z')
    await measure('schedule-after-720x500')
    await screenshot('ux-cron-schedule-dark-720')
    await tab('Schedule').focus()
    await page.keyboard.press('ArrowRight')
    assert.equal(await tab('Upcoming runs').getAttribute('aria-selected'), 'true')
    assert.equal(await tab('Upcoming runs').evaluate((element) => element === document.activeElement), true)
    await expectRuns(['2026-10-06T09:00:00.000Z', '2026-10-07T09:00:00.000Z', '2026-10-08T09:00:00.000Z'])
    const previewBounds = await measure('preview-after-720x500')
    assert.ok(previewBounds.firstRun.top < 465, 'First run still begins below the reachable preview viewport')
    await screenshot('ux-cron-preview-dark-720')
    await page.getByRole('button', { name: 'Copy JSON', exact: true }).click()
    let exported = JSON.parse(await page.evaluate(() => window.__cronCopied.at(-1)))
    assert.equal(exported.expression, '0 9 * * 1-5')
    assert.equal(exported.timezone, 'UTC')
    assert.equal(exported.from, '2026-10-05T09:00:00.000Z')
    assert.deepEqual(exported.nextRuns, ['2026-10-06T09:00:00.000Z', '2026-10-07T09:00:00.000Z', '2026-10-08T09:00:00.000Z'])
    await summary('Export').click()
    const downloaded = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download', exact: true }).click()
    const download = await downloaded
    assert.equal(download.suggestedFilename(), 'cron-preview.json')
    assert.deepEqual(JSON.parse(await readFile(await download.path(), 'utf8')), exported)
    await summary('Export').click()
    await noOverflow()

    // Route navigation restores all preview settings from RAM, never localStorage.
    await page.getByRole('link', { name: 'All tools', exact: true }).click()
    await page.getByRole('heading', { name: 'DevFusion', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Cron Calculator', exact: true }).first().click()
    await expression().waitFor()
    assert.equal(await expression().inputValue(), '0 9 * * 1-5')
    assert.equal(await zone().inputValue(), 'UTC')
    assert.equal(await start().inputValue(), '2026-10-05T09:00:00Z')
    assert.equal(await count().inputValue(), '3')
    assert.equal(await page.evaluate(() => Object.values(localStorage).some((value) => value.includes('2026-10-05T09:00:00Z') || value.includes('0 9 * * 1-5'))), false)

    await expression().fill('0 99 * * *')
    await expectInvalidDescription(expression(), /Hour: invalid value/)
    await preview()
    assert.equal(await runs().count(), 0, 'Invalid expression retained stale run times')
    assert.equal(await page.getByRole('button', { name: 'Copy JSON', exact: true }).isDisabled(), true)
    await page.getByRole('button', { name: 'Fix expression', exact: true }).click()
    assert.equal(await expression().evaluate((element) => element === document.activeElement), true)
    await expression().fill('0 9 * * 1-5')
    await count().fill('')
    assert.equal(await count().inputValue(), '', 'Clearing run count coerced it to zero')
    await expectInvalidDescription(count(), /whole number from 1 to 50/)
    await preview()
    await page.getByRole('button', { name: 'Fix run count', exact: true }).click()
    assert.equal(await count().evaluate((element) => element === document.activeElement), true)
    await count().fill('1.5')
    await expectInvalidDescription(count(), /whole number from 1 to 50/)
    await count().fill('3')
    await start().fill('2026-02-30T00:00:00Z')
    await expectInvalidDescription(start(), /28 days/)
    await preview()
    assert.equal(await runs().count(), 0, 'Impossible start date retained stale run times')
    await summary('Export').click()
    assert.equal(await page.getByRole('button', { name: 'Download', exact: true }).isDisabled(), true)
    await summary('Export').click()
    await page.getByRole('button', { name: 'Fix start time', exact: true }).click()
    assert.equal(await start().evaluate((element) => element === document.activeElement), true)
    await start().fill('2026-10-05T09:00:00')
    await expectInvalidDescription(start(), /with Z or a UTC offset/)
    await page.getByRole('button', { name: 'Now', exact: true }).click()
    assert.equal(await start().getAttribute('aria-invalid'), 'false')
    await start().fill('2026-10-05T09:00:00Z')

    await expression().fill('0 17 * * MON')
    await summary('Preset schedules').click()
    await page.getByRole('button').filter({ has: page.getByText('Daily midnight', { exact: true }) }).click()
    assert.equal(await expression().inputValue(), '0 0 * * *')
    assert.equal(await zone().inputValue(), 'UTC')
    assert.equal(await start().inputValue(), '2026-10-05T09:00:00Z')
    await page.getByRole('button', { name: 'Undo preset', exact: true }).click()
    assert.equal(await expression().inputValue(), '0 17 * * MON')
    await page.getByRole('button').filter({ has: page.getByText('Weekdays 9 AM', { exact: true }) }).click()
    await expression().fill('0 12 * * *')
    assert.equal(await page.getByRole('button', { name: 'Undo preset', exact: true }).count(), 0, 'Preset Undo overwrote a subsequent edit')
    await summary('Preset schedules').click()
    await summary('Syntax and compatibility').click()
    await page.getByText(/does not support Quartz/).waitFor()
    await page.getByText(/otherwise both day rules must match/i).waitFor()
    await summary('Syntax and compatibility').click()

    await expression().fill('0 0 31 FEB *')
    await preview()
    await page.getByRole('heading', { name: 'No upcoming runs · UTC', exact: true }).waitFor()
    assert.equal(await runs().count(), 0)
    await page.getByText(/No matching dates were found within 8 years/).waitFor()
    await page.getByRole('button', { name: 'Copy JSON', exact: true }).click()
    exported = JSON.parse(await page.evaluate(() => window.__cronCopied.at(-1)))
    assert.deepEqual(exported.nextRuns, [])

    // The existing local wall-time preview policy preserves both DST fold instants.
    await schedule()
    await expression().fill('30 1 * * *')
    await zone().selectOption('local')
    await start().fill('2024-11-03T04:00:00Z')
    await count().fill('2')
    await preview()
    await expectRuns(['2024-11-03T05:30:00.000Z', '2024-11-03T06:30:00.000Z'])
    const wallTimes = await runs().allTextContents()
    assert.equal(wallTimes[0], wallTimes[1], 'Fixture does not represent repeated wall-clock times')
    await page.getByText('2024-11-03T05:30:00.000Z · UTC', { exact: true }).waitFor()
    await page.getByText('2024-11-03T06:30:00.000Z · UTC', { exact: true }).waitFor()
    await schedule()
    const unchangedInstant = await start().inputValue()
    await zone().selectOption('UTC')
    assert.equal(await start().inputValue(), unchangedInstant)
    await expression().fill('*/30 * * * * *')
    await start().fill('2026-10-05T00:00:00.500Z')
    await count().fill('3')
    await preview()
    await expectRuns(['2026-10-05T00:00:30.000Z', '2026-10-05T00:01:00.000Z', '2026-10-05T00:01:30.000Z'])
    await summary('Field breakdown').click()
    await page.locator('dt').filter({ hasText: /^Second$/ }).waitFor()
    await summary('Field breakdown').click()

    await page.setViewportSize({ width: 1180, height: 760 })
    await page.getByRole('region', { name: 'Schedule', exact: true }).waitFor()
    await page.getByRole('region', { name: 'Upcoming runs', exact: true }).waitFor()
    assert.equal(await tab('Schedule').count(), 0)
    await page.getByLabel('Upcoming run preview', { exact: true }).evaluate((element) => { element.scrollTop = 0 })
    await measure('wide-after-1180x760')
    await screenshot('ux-cron-dark-1180')
    await noOverflow()
    await page.getByRole('button', { name: 'Switch to light theme', exact: true }).click()
    await screenshot('ux-cron-light-1180')
    await page.getByLabel('Upcoming run preview', { exact: true }).focus()
    await page.setViewportSize({ width: 720, height: 500 })
    await page.waitForFunction(() => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent === 'Upcoming runs')
    assert.equal(await page.getByLabel('Upcoming run preview', { exact: true }).evaluate((element) => element === document.activeElement), true)
    await screenshot('ux-cron-preview-light-720')
    await noOverflow()
    await schedule()
    await expression().focus()
    await screenshot('ux-cron-schedule-light-720')
    await page.setViewportSize({ width: 360, height: 250 })
    const reachable = async (element, minimumHeight) => {
      await element.scrollIntoViewIfNeeded()
      const bounds = await element.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        let top = Math.max(0, rect.top), bottom = Math.min(innerHeight, rect.bottom)
        let left = Math.max(0, rect.left), right = Math.min(innerWidth, rect.right)
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent), box = parent.getBoundingClientRect()
          if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { top = Math.max(top, box.top); bottom = Math.min(bottom, box.bottom) }
          if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { left = Math.max(left, box.left); right = Math.min(right, box.right) }
        }
        return { height: rect.height, visibleHeight: Math.max(0, bottom - top), visibleWidth: Math.max(0, right - left) }
      })
      assert.ok(bounds.visibleHeight >= minimumHeight && bounds.visibleWidth > 100, `Control is unreachable in the short zoomed workspace: ${JSON.stringify(bounds)}`)
      return bounds
    }
    await expression().focus()
    const expressionZoom = await reachable(expression(), 34)
    await noOverflow()
    await preview()
    await noOverflow()
    const runZoom = await reachable(runs().first(), 18)
    const workspace = await page.locator('[data-cron-workspace]').evaluate((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }))
    assert.ok(workspace.scrollHeight > workspace.clientHeight, 'Short-height workspace has no outer scroll escape')
    report.views.push({ name: 'reachable-logical-200pct', viewport: { width: 360, height: 250 }, expressionZoom, runZoom, workspace })
    await screenshot('ux-cron-light-logical-200pct')
    console.log('PASS Cron: reachable workspace panes, keyboard tabs, strict-start and DST/seconds previews, precise invalid-input recovery, preset Undo, full RAM draft restoration, copy/download semantics and desktop light/dark/zoom layouts')
  }
  assert.deepEqual(errors, [])
  if (process.env.BRAND_SCREENSHOT_DIR) await writeFile(join(process.env.BRAND_SCREENSHOT_DIR, process.env.UX_CRON_BASELINE ? 'ux-cron-baseline.json' : 'ux-cron-results.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} finally {
  const closed = new Promise((done) => server.close(done)); server.closeAllConnections(); await browser.close(); await closed
}