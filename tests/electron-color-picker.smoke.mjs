import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtemp, rm, mkdir, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join, basename, sep } from 'node:path'
import { spawn } from 'node:child_process'

// Actual OS desktop capture of a known color in a separate fixture window.
// Desktop snapshots remain in RAM; no clipboard read, real vault or screenshot
// export. Only the resulting single color is inspected.
const root = await mkdtemp(join(tmpdir(), 'devfusion-color-picker-'))
try {
  await mkdir(join(root, 'main', 'resources'), { recursive: true })
  await mkdir(join(root, 'preload'))
  for (const name of ['color-picker.html', 'color-picker.js', 'icon.png', 'icon.ico']) await copyFile(resolve('resources', name), join(root, 'main', 'resources', name))
  await copyFile(resolve('out/preload/colorPicker.js'), join(root, 'preload', 'colorPicker.js'))
  const entry = join(root, 'main', 'smoke.cjs')
  const source = `
    import { app, BrowserWindow, screen } from 'electron'
    import { ScreenColorPicker, registerColorPickerIpc } from './src/main/color-picker'
    const root = ${JSON.stringify(root)}
    app.setPath('userData', root); app.setPath('sessionData', root); app.setPath('crashDumps', root)
    app.on('window-all-closed', () => {})
    const assert = (ok, message) => { if(!ok) throw new Error(message) }
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
    const until = async read => { for(let i=0;i<150;i++){ const value=await read(); if(value)return value; await wait(50) } throw new Error('Native picker wait timed out') }
    let fixture, picker
    app.whenReady().then(async () => {
      try {
        const display = screen.getPrimaryDisplay(), area = display.workArea
        const x = area.x + area.width - 200, y = area.y + area.height - 200
        fixture = new BrowserWindow({x,y,width:140,height:140,frame:false,resizable:false,alwaysOnTop:true,skipTaskbar:true,backgroundColor:'#FF8800', webPreferences:{ sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true }})
        await fixture.loadURL('data:text/html,<html style="background:%23FF8800"><body></body></html>')
        fixture.show(); await wait(500)
        picker = new ScreenColorPicker(); registerColorPickerIpc(picker)
        const selected = picker.pick()
        // Observe app-owned windows only. Target is outside the old central helper.
        const overlays = await until(() => { const list = BrowserWindow.getAllWindows().filter(win=>win!==fixture && win.isVisible() && !win.isDestroyed()); return list.length===screen.getAllDisplays().length ? list : null })
        const target = {x:x+70,y:y+70}
        const overlay = overlays.find(win=>{ const b=win.getBounds(); return target.x>=b.x && target.x<b.x+b.width && target.y>=b.y && target.y<b.y+b.height })
        assert(overlay, 'OS target point is not covered by an overlay')
        const bounds = overlay.getBounds()
        assert(bounds.width===display.bounds.width && bounds.height===display.bounds.height, 'Overlay does not cover full display bounds: actual='+JSON.stringify(bounds)+' expected='+JSON.stringify(display.bounds))
        const sampled = await overlay.webContents.executeJavaScript('(() => { const c=document.getElementById("desktop"), r=c.getBoundingClientRect(), p='+JSON.stringify({x:target.x-bounds.x,y:target.y-bounds.y})+'; const d=c.getContext("2d").getImageData(Math.floor(p.x*c.width/r.width),Math.floor(p.y*c.height/r.height),1,1).data; c.dispatchEvent(new PointerEvent("pointerdown",{clientX:p.x,clientY:p.y,button:0})); return Array.from(d.slice(0,3)) })()')
        assert(sampled[0]===255 && sampled[1]===136 && sampled[2]===0, 'Captured OS fixture pixel is wrong: '+JSON.stringify(sampled))
        assert((await selected)?.hex==='#FF8800', 'Picking outside the old helper returned the wrong color')
        assert(overlays.every(win=>win.isDestroyed()), 'Selection retained desktop overlay/snapshot renderers')
        console.log('PASS actual OS pixel outside old helper; full-display coverage; overlays destroyed')
        let popup = await until(()=>BrowserWindow.getAllWindows().find(win=>win!==fixture && !win.isDestroyed() && win.isVisible()))
        const formats = await popup.webContents.executeJavaScript('Array.from(document.querySelectorAll(".field input"),input=>input.value)')
        assert(formats.length===4 && formats[0]==='#FF8800' && formats[1]==='rgb(255, 136, 0)', 'Format popup incomplete')
        assert(await popup.webContents.executeJavaScript('!!document.getElementById("repick") && !!window.screenPicker && !window.devutils'), 'Helper bridge/UI missing or toolbox API exposed')
        assert(await popup.webContents.executeJavaScript('(()=>{const image=document.querySelector(".brand img"),r=image.getBoundingClientRect();return image.naturalWidth>0&&r.width===24&&r.height===24&&getComputedStyle(image).objectFit==="contain"})()'), 'Color result product logo missing or distorted')
        console.log('PASS native result popup with HEX/RGB/HSL/HSV and Repick; minimal sandboxed preload')
        await popup.webContents.executeJavaScript('document.getElementById("repick").click()')
        const next = await until(()=>BrowserWindow.getAllWindows().find(win=>win!==fixture && !win.isDestroyed() && win.isVisible() && win.getBounds().width===display.bounds.width))
        assert(popup.isDestroyed(), 'Repick kept old popup')
        await next.webContents.executeJavaScript('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))')
        popup = await until(()=>BrowserWindow.getAllWindows().find(win=>win!==fixture && !win.isDestroyed() && win.isVisible()))
        assert(await popup.webContents.executeJavaScript('document.getElementById("selected-hex").textContent')==='#FF8800', 'Cancel repick lost selected color')
        await popup.webContents.executeJavaScript('document.getElementById("close").click()')
        await until(()=>BrowserWindow.getAllWindows().filter(win=>win!==fixture).length===0)
        console.log('PASS native Repick → Esc restores result → Close releases all helper windows')
        picker.dispose(); fixture.destroy(); app.exit(0)
      } catch(error) { console.error('SMOKE FAILED',error.stack); picker?.dispose(); for(const win of BrowserWindow.getAllWindows())if(!win.isDestroyed())win.destroy(); app.exit(1) }
    })
  `
  await build({ stdin: { contents: source, resolveDir: process.cwd(), loader: 'ts' }, outfile: entry, bundle: true, platform: 'node', format: 'cjs', packages: 'external', alias: { '@shared': resolve('src/shared') } })
  const electron = createRequire(import.meta.url)('electron')
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(electron, [entry], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.pipe(process.stdout); child.stderr.pipe(process.stderr)
  let timer
  const code = await new Promise((done, reject) => {
    timer = setTimeout(() => { child.kill(); reject(new Error('Native picker smoke exceeded 45 seconds')) }, 45000)
    child.once('error', reject); child.once('exit', done)
  }).finally(() => clearTimeout(timer))
  if (code !== 0) throw new Error('Native picker smoke exited ' + code)
} finally {
  const target = resolve(root)
  if (!target.startsWith(resolve(tmpdir()) + sep) || !basename(target).startsWith('devfusion-color-picker-')) throw new Error('Unexpected cleanup path')
  await rm(target, { recursive: true, force: true })
}
