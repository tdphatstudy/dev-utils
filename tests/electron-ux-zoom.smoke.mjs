import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join, basename, sep } from 'node:path'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'

// Real Electron zoom/focus, hidden test window and temporary profile only.
// This runs the production file renderer without a privileged bridge/vault.
const directory = await mkdtemp(join(tmpdir(), 'devfusion-native-ux-'))
try {
  const entry = join(directory, 'fixture.cjs')
  const renderer = resolve('out/renderer/index.html')
  const screenshots = process.env.BRAND_SCREENSHOT_DIR ? resolve(process.env.BRAND_SCREENSHOT_DIR) : null
  if (screenshots) await mkdir(screenshots, { recursive: true })
  await writeFile(entry, `
    const { app, BrowserWindow } = require('electron')
    const { writeFileSync } = require('node:fs')
    const directory = ${JSON.stringify(directory)}, renderer = ${JSON.stringify(renderer)}, screenshots = ${JSON.stringify(screenshots)}
    app.setPath('userData', directory); app.setPath('sessionData', directory); app.setPath('crashDumps', directory)
    app.on('window-all-closed', () => {})
    const sleep = ms => new Promise(done => setTimeout(done, ms))
    const assert = (value, message) => { if (!value) throw new Error(message) }
    let win
    const js = async source => { try { return await win.webContents.executeJavaScript(source) } catch (error) { throw new Error('Fixture step failed: ' + source + ' | ' + error.message) } }
    const waitFor = async source => {
      const deadline = Date.now() + 10000
      while (Date.now() < deadline) { if (await js(source)) return; await sleep(30) }
      throw new Error('Native UI timed out: ' + source)
    }
    // Hidden-window bitmap captures may return an older compositor frame.
    // Validate live theme, focus and computed clipped geometry here; browser QA owns images.
    const report = []
    app.whenReady().then(async () => {
      try {
        win = new BrowserWindow({ show: false, frame: false, width: 720, height: 500,
          webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: false } })
        const prefs = win.webContents.getLastWebPreferences()
        assert(prefs.sandbox && prefs.contextIsolation && prefs.webSecurity && !prefs.nodeIntegration, 'Native test weakened Electron protections')
        await win.loadFile(renderer, { hash: '/' })
        await waitFor('document.querySelector("main h1")?.textContent==="DevFusion"')
        win.webContents.focus()
        for (const theme of ['dark', 'light']) {
          await js("location.hash='/'")
          await waitFor('document.querySelector("main h1")?.textContent==="DevFusion"')
          await js('if(getComputedStyle(document.body).colorScheme!=='+JSON.stringify(theme)+'){[...document.querySelectorAll("header button")].find(e=>e.title.startsWith("Switch to")).click()}')
          await waitFor('getComputedStyle(document.body).colorScheme==='+JSON.stringify(theme))
          const nativeTheme = await js('({scheme:getComputedStyle(document.body).colorScheme,root:document.documentElement.className,storage:localStorage.getItem("devutils-app")})')
          assert(nativeTheme.scheme === theme, 'Native fixture theme mismatch: '+JSON.stringify({theme,...nativeTheme}))
          for (const zoom of [1, 1.25, 1.5, 2]) {
            win.webContents.focus(); win.webContents.setZoomFactor(zoom)
            await sleep(100)
            await js('document.querySelector("header button").focus(); document.querySelector("header button").click()')
            await waitFor('!!document.querySelector("input[role=combobox]")')
            await sleep(200)
            win.webContents.insertText('no-native-fixture-match')
            await waitFor('document.querySelector("[role=dialog]")?.textContent.includes("No tools found")')
            const view = await js('(()=>{const dialog=document.querySelector("[role=dialog]"), input=dialog.querySelector("input"), row=input.parentElement, close=dialog.querySelector("button"), rect=dialog.getBoundingClientRect(), c=close.getBoundingClientRect(); return {width:innerWidth,height:innerHeight,rect:{x:rect.x,y:rect.y,right:rect.right,bottom:rect.bottom},close:{x:c.x,y:c.y,right:c.right,bottom:c.bottom},outline:getComputedStyle(input).outlineStyle,outlineColor:getComputedStyle(input).outlineColor,hasFocus:document.hasFocus(),focusVisible:input.matches(":focus-visible"),inputClass:input.className,rowClass:row.className,shadow:getComputedStyle(row).boxShadow,focus:document.activeElement===input}})()')
            assert(view.rect.x >= 0 && view.rect.y >= 0 && view.rect.right <= view.width+1 && view.rect.bottom <= view.height+1, 'Palette exceeds native viewport: '+JSON.stringify(view))
            assert(view.close.x >= view.rect.x && view.close.right <= view.rect.right && view.close.bottom <= view.rect.bottom, 'Native close control clipped')
            assert(view.outline === 'none' && view.shadow.includes('inset') && view.focus, 'Native search focus incorrect: '+JSON.stringify(view))
            report.push({theme,zoom,...view})
            win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'})
            win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'})
            await waitFor('!document.querySelector("[role=dialog]")')
            await waitFor('document.activeElement===document.querySelector("header button")')
          }
          win.setBounds({width:1180,height:760})
          win.webContents.setZoomFactor(2)
          await js("location.hash='/tool/json.studio'")
          await waitFor('!!document.querySelector("[data-tool-ready]") && !!document.querySelector(".cm-content")')
          await sleep(200)
          const editor = await js('(()=>{const e=document.querySelector(".cm-content").closest(".cm-editor"),b=e.getBoundingClientRect(),tab=document.querySelector("[role=tab][aria-selected=true]");return{height:b.height,bottom:b.bottom,viewport:innerHeight,pane:tab?.textContent}})()')
          assert(editor.height >= 40 && editor.bottom <= editor.viewport+1 && editor.pane==='Input', 'JSON input unavailable at native2x: '+JSON.stringify(editor))
          await js('[...document.querySelectorAll("[role=tab]")].find(e=>e.textContent==="Output").click()')
          await waitFor('document.querySelector("[role=tab][aria-selected=true]")?.textContent==="Output"')
          assert(await js('[...document.querySelectorAll("button")].some(e=>e.textContent.includes("Copy output") && e.getBoundingClientRect().height>0)'), 'JSON output action unavailable at native2x')
          await js('window.__nativeFixtureVisibleHeight=e=>{const b=e.getBoundingClientRect();let top=Math.max(0,b.top),bottom=Math.min(innerHeight,b.bottom);for(let p=e.parentElement;p;p=p.parentElement){if(/auto|scroll|hidden|clip/.test(getComputedStyle(p).overflowY)){const c=p.getBoundingClientRect();top=Math.max(top,c.top);bottom=Math.min(bottom,c.bottom)}}return Math.max(0,bottom-top)};void 0')
          win.setBounds({width:720,height:500})
          win.webContents.setZoomFactor(2)
          for (const tool of ['security.aes', 'security.hmac']) {
            await js("location.hash='/tool/"+tool+"'")
            await waitFor('document.querySelector("[data-tool-ready]")?.getAttribute("data-tool-ready")==='+JSON.stringify(tool)+' && !!document.querySelector(".cm-content")')
            await sleep(100)
            const inputArea = await js('(()=>{const e=document.querySelector(".cm-content");e.scrollIntoView({block:"center"});e.focus();const b=e.getBoundingClientRect();return{height:b.height,visible:window.__nativeFixtureVisibleHeight(e),focus:document.activeElement===e}})()')
            assert(inputArea.height >= 40 && inputArea.visible >= 30 && inputArea.focus, tool+' input collapsed at native2x: '+JSON.stringify(inputArea))
            await js('(()=>{const tab=[...document.querySelectorAll("[role=tab]")].find(e=>e.textContent==="Output");tab.scrollIntoView({block:"center"});tab.click()})()')
            await waitFor('document.querySelector("[role=tab][aria-selected=true]")?.textContent==="Output"')
            const outputArea = await js('(()=>{const e=[...document.querySelectorAll(".cm-content")].find(e=>e.getBoundingClientRect().height>0);e.scrollIntoView({block:"center"});const b=e.getBoundingClientRect();return{height:b.height,visible:window.__nativeFixtureVisibleHeight(e)}})()')
            assert(outputArea.height >= 40 && outputArea.visible >= 30, tool+' output collapsed at native2x: '+JSON.stringify(outputArea))
            report.push({theme,zoom:2,tool,inputArea,outputArea})
          }
          await js("location.hash='/tool/text.cron'")
          await waitFor('!!document.querySelector("[data-cron-runs]")')
          const cronInput = await js('(()=>{const e=[...document.querySelectorAll("label")].find(e=>e.textContent==="Expression");const input=document.getElementById(e.htmlFor);input.focus();const b=input.getBoundingClientRect();return{height:b.height,visible:window.__nativeFixtureVisibleHeight(input),focus:document.activeElement===input}})()')
          assert(cronInput.height >= 30 && cronInput.visible >= 30 && cronInput.focus, 'Cron input unavailable at native2x: '+JSON.stringify(cronInput))
          await js('(()=>{const tab=[...document.querySelectorAll("[role=tab]")].find(e=>e.textContent==="Upcoming runs");tab.scrollIntoView({block:"center"});tab.click()})()')
          await waitFor('!!document.querySelector("[data-cron-runs] li") && document.querySelector("[data-cron-runs] li").getBoundingClientRect().height>0')
          const cronPreview = await js('(()=>{const e=document.querySelector("[data-cron-runs] li time");e.scrollIntoView({block:"center"});const b=e.getBoundingClientRect();return{height:b.height,visible:window.__nativeFixtureVisibleHeight(e)}})()')
          assert(cronPreview.height >= 18 && cronPreview.visible >= 18, 'Cron run unavailable at native2x: '+JSON.stringify(cronPreview))
          report.push({theme,zoom:2,tool:'text.cron',cronInput,cronPreview})
          win.webContents.setZoomFactor(1)
        }
        if (screenshots) writeFileSync(screenshots+'/native-ux-zoom-results.json',JSON.stringify({electron:process.versions.electron,chromium:process.versions.chrome,platform:process.platform,report},null,2))
        console.log('PASS Electron '+process.versions.electron+' actual palette zoom 100/125/150/200%, inset focus/escape return, JSON and short-window AES/HMAC/Cron input/output at2x in light/dark')
        win.destroy(); app.exit(0)
      } catch (error) { console.error(error); if(win && !win.isDestroyed())win.destroy(); app.exit(1) }
    })
  `)
  const electron = createRequire(import.meta.url)('electron')
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(electron, [entry], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.pipe(process.stdout); child.stderr.pipe(process.stderr)
  let timer
  const code = await new Promise((done, reject) => {
    timer = setTimeout(() => { child.kill(); reject(new Error('Native UX exceeded 55 seconds')) }, 55000)
    child.once('error', reject); child.once('exit', done)
  }).finally(() => clearTimeout(timer))
  if (code !== 0) throw new Error('Native UX exited '+code)
} finally {
  const target = resolve(directory)
  if (!target.startsWith(resolve(tmpdir())+sep) || !basename(target).startsWith('devfusion-native-ux-')) throw new Error('Unexpected cleanup path')
  await rm(target, { recursive: true, force: true })
}