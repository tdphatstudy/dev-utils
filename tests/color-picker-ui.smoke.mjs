import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mkdir } from 'node:fs/promises'
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ channel: process.env.UX_BROWSER_CHANNEL || undefined, headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 460 }, colorScheme: 'dark' })
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    const state = window.__pickerTest = { ready: 0, copied: [], repicks: 0, closed: 0, failCopy: false }
    window.screenPicker = {
      view: async () => ({ kind: 'result', color: { hex: '#FF8800', rgb: 'rgb(255, 136, 0)', hsl: 'hsl(32, 100%, 50%)', hsv: 'hsv(32, 100%, 100%)', foreground: '#000000', contrast: 8.77 } }),
      ready: async () => { state.ready++ }, close: async () => { state.closed++ }, repick: async () => { state.repicks++ },
      copy: async format => { if(state.failCopy)throw new Error('Fixture clipboard denied'); state.copied.push(format) }
    }
  })
  await page.goto(pathToFileURL(resolve('resources/color-picker.html')).href)
  await page.waitForFunction(()=>window.__pickerTest.ready===1)
  for (const format of ['HEX', 'RGB', 'HSL', 'HSV']) await page.getByRole('button', { name: 'Copy '+format, exact: true }).click()
  assert.deepEqual(await page.evaluate(()=>window.__pickerTest.copied), ['hex','rgb','hsl','hsv'])
  await page.evaluate(()=>window.__pickerTest.failCopy=true)
  await page.getByRole('button', { name: 'Copy RGB', exact: true }).click()
  await page.getByRole('alert').filter({hasText:'Fixture clipboard denied'}).waitFor()
  await page.evaluate(()=>window.__pickerTest.failCopy=false)
  await page.getByRole('button', { name: 'Copy RGB', exact: true }).click()
  await page.getByRole('status').filter({hasText:'RGB copied'}).waitFor()
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight), 'Popup overflows')
  if(process.env.BRAND_SCREENSHOT_DIR) { await mkdir(process.env.BRAND_SCREENSHOT_DIR,{recursive:true}); await page.screenshot({path:join(process.env.BRAND_SCREENSHOT_DIR,'devfusion-color-popup.png')}) }
  await page.getByRole('button', { name: 'Pick another color', exact: true }).click()
  assert.equal(await page.evaluate(()=>window.__pickerTest.repicks),1)
  await page.keyboard.press('Escape')
  assert.equal(await page.evaluate(()=>window.__pickerTest.closed),1)
  console.log('PASS result popup preview, four format Copy actions, clipboard failure/retry, Repick, Esc and bounds')
  const overlay = await browser.newPage({viewport:{width:1024,height:768}})
  const image = await overlay.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=960;const c=canvas.getContext('2d');c.fillStyle='#112233';c.fillRect(0,0,1280,960);c.fillStyle='#FF8800';c.fillRect(1200,850,80,110);return canvas.toDataURL()})
  await overlay.addInitScript(({image})=>{
    const state=window.__pickerTest={ready:0,selected:[],cancelled:0}
    window.screenPicker={view:async()=>({kind:'overlay',image}),ready:async()=>{state.ready++},select:async hex=>{state.selected.push(hex)},cancel:async()=>{state.cancelled++},close:async()=>{}}
  },{image})
  await overlay.goto(pathToFileURL(resolve('resources/color-picker.html')).href)
  await overlay.waitForFunction(()=>window.__pickerTest.ready===1)
  await overlay.mouse.move(1000,720)
  await overlay.getByText('#FF8800',{exact:true}).waitFor()
  await overlay.mouse.click(1000,720)
  assert.deepEqual(await overlay.evaluate(()=>window.__pickerTest.selected),['#FF8800'])
  await overlay.keyboard.press('Escape')
  assert.equal(await overlay.evaluate(()=>window.__pickerTest.cancelled),1)
  assert.deepEqual(errors,[])
  console.log('PASS full-overlay pixel selection outside popup bounds, magnifier and HiDPI coordinate mapping')
} finally { await browser.close() }
