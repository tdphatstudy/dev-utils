import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtemp, rm, mkdir, copyFile, cp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join, basename, sep } from 'node:path'
import { spawn } from 'node:child_process'

// Real packaged browser workers, WASM and English/Vietnamese models. All file
// inputs and the selected screen region are generated test fixtures.
const root = await mkdtemp(join(tmpdir(), 'devfusion-ocr-'))
try {
  await mkdir(join(root, 'main', 'resources'), { recursive: true })
  await mkdir(join(root, 'preload'))
  for (const name of ['ocr-helper.html', 'ocr-helper.js', 'icon.png', 'icon.ico']) await copyFile(resolve('resources', name), join(root, 'main', 'resources', name))
  await copyFile(resolve('out/preload/ocrHelper.js'), join(root, 'preload/ocrHelper.js'))
  await cp(resolve('out/renderer'), join(root, 'renderer'), { recursive: true })
  const entry = join(root, 'main', 'smoke.cjs')
  const source = `
    import { app, BrowserWindow, screen, nativeImage, protocol } from 'electron'
    import { DesktopOcr, registerOcrIpc } from './src/main/ocr'
    const root = ${JSON.stringify(root)}
    app.setPath('userData', root); app.setPath('sessionData', root); app.setPath('crashDumps', root)
    protocol.registerSchemesAsPrivileged([{scheme:'devfusion-ocr',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}])
    app.commandLine.appendSwitch('disable-features','CalculateNativeWinOcclusion,SpareRendererForSitePerProcess')
    app.commandLine.appendSwitch('js-flags','--optimize-for-size')
    app.on('window-all-closed',()=>{})
    const assert=(ok,msg)=>{if(!ok)throw new Error(msg)}
    const wait=ms=>new Promise(ok=>setTimeout(ok,ms))
    const memory=()=>({rssMiB:Math.round(app.getAppMetrics().reduce((sum,item)=>sum+(item.memory?.workingSetSize??0),0)/1024),renderers:app.getAppMetrics().filter(item=>item.type==='Tab').length})
    const until=async(read)=>{for(let i=0;i<300;i++){const value=await read();if(value)return value;await wait(50)}throw new Error('OCR fixture wait timed out')}
    // Tiny deterministic PDF writer: no PDF dependency needed to create fixtures.
    function pdf(objects){
      const chunks=[Buffer.from('%PDF-1.7\\n')], offsets=[0];let size=chunks[0].length
      objects.forEach((data,i)=>{offsets.push(size);const chunk=Buffer.concat([Buffer.from((i+1)+' 0 obj\\n'),Buffer.isBuffer(data)?data:Buffer.from(data),Buffer.from('\\nendobj\\n')]);chunks.push(chunk);size+=chunk.length})
      const offset=size;const xref='xref\\n0 '+(objects.length+1)+'\\n0000000000 65535 f \\n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \\n').join('')+'trailer\\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\\nstartxref\\n'+offset+'\\n%%EOF'
      chunks.push(Buffer.from(xref));return new Uint8Array(Buffer.concat(chunks))
    }
    const stream=(dict,data)=>Buffer.concat([Buffer.from('<< '+dict+' /Length '+data.length+' >>\\nstream\\n'),data,Buffer.from('\\nendstream')])
    const textPdf=()=>pdf(['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',stream('',Buffer.from('BT /F1 32 Tf 30 100 Td (DevFusion PDF native text) Tj ET')),'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'])
    const scanPdf=(jpeg)=>pdf(['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 120] /Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>',stream('',Buffer.from('q 600 0 0 120 0 0 cm /Im1 Do Q')),stream('/Type /XObject /Subtype /Image /Width 1200 /Height 240 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode',jpeg),'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 120] /Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>'])
    let fixture,ocr,meter,peak=0,cold
    app.on('browser-window-created',(_event,win)=>{
      win.webContents.on('console-message',(_event,level,message)=>{if(level>=2)console.log('HELPER:',message.slice(0,220))})
    })
    app.whenReady().then(async()=>{
      try{
        ocr=new DesktopOcr();registerOcrIpc(ocr)
        cold=memory();meter=setInterval(()=>{peak=Math.max(peak,memory().rssMiB)},150)
        assert(BrowserWindow.getAllWindows().length===0,'Idle OCR created a renderer')
        const captureDisplay=screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
        const area=captureDisplay.workArea
        fixture=new BrowserWindow({x:area.x+50,y:area.y+50,width:700,height:180,frame:false,alwaysOnTop:true,skipTaskbar:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}})
        await fixture.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<html style="background:white"><body style="margin:25px;color:black;font:34px Arial">DevFusion SCREEN OCR 123</body></html>'))
        const data=await fixture.webContents.executeJavaScript('(()=>{const c=document.createElement("canvas");c.width=1200;c.height=240;const ctx=c.getContext("2d");ctx.fillStyle="white";ctx.fillRect(0,0,1200,240);ctx.fillStyle="black";ctx.font="48px Arial";ctx.fillText("DevFusion OCR 123",40,80);ctx.fillText("Tiếng Việt: Xin chào thế giới",40,170);return c.toDataURL("image/png")})()')
        const png=nativeImage.createFromDataURL(data), bytes=new Uint8Array(png.toPNG())
        const pendingImage=ocr.recognize({id:'image',kind:'image',bytes,language:'eng+vie'},fixture.webContents,false)
        const hiddenRunner=await until(()=>BrowserWindow.getAllWindows().find(w=>w!==fixture))
        assert(!hiddenRunner.isVisible(),'Inline OCR exposed its engine window')
        const result=await pendingImage
        assert(result?.text.includes('DevFusion OCR 123') && result.text.includes('Xin chào'),'Real English/Vietnamese OCR failed: '+result?.text)
        assert(result.ocrPages===1 && BrowserWindow.getAllWindows().length===1,'Image completion retained OCR renderer')
        console.log('PASS real offline PNG OCR, English + Vietnamese, engine renderer released')
        if(process.argv.includes('--inline-only')) {clearInterval(meter);fixture.destroy();console.log('PASS invisible OCR runner with real bundled models; no screen captured');app.exit(0);return}
        const stages=[];const report=ocr.progress.bind(ocr)
        ocr.progress=(event,value)=>{stages.push(value.stage);return report(event,value)}
        // Native text PDF should not start an OCR worker/core/model.
        const native=await ocr.recognize({id:'pdf-native',kind:'pdf',bytes:textPdf(),language:'eng'},fixture.webContents)
        assert(native?.text.includes('DevFusion PDF native text') && native.ocrPages===0,'Native PDF text extraction failed')
        assert(!stages.includes('Preparing text recognition'),'Text PDF loaded OCR core/model')
        console.log('PASS real PDF text layer bypasses OCR model/worker')
        const scanned=await ocr.recognize({id:'pdf-scan',kind:'pdf',bytes:scanPdf(png.toJPEG(95)),language:'eng+vie'},fixture.webContents)
        assert(scanned?.text.includes('DevFusion OCR 123') && scanned.ocrPages===2 && scanned.pages===2,'Scanned PDF OCR failed: '+scanned?.text)
        assert(stages.includes('Preparing text recognition'),'Scan skipped OCR engine')
        console.log('PASS real scanned PDF rendering → sequential OCR → renderer release')
        const forced=await ocr.recognize({id:'pdf-force',kind:'pdf',bytes:textPdf(),language:'eng',forceOcr:true},fixture.webContents)
        assert(forced?.text.includes('DevFusion PDF native text') && forced.ocrPages===1,'Force OCR PDF mode failed')
        console.log('PASS force OCR mode renders PDF text layers instead of skipping scan content')
        const cancel=ocr.recognize({id:'cancel',kind:'image',bytes,language:'eng'},fixture.webContents)
        await until(()=>BrowserWindow.getAllWindows().find(w=>w!==fixture))
        assert(ocr.cancel('cancel',fixture.webContents),'Cancel refused current owner')
        assert(await cancel===null && BrowserWindow.getAllWindows().length===1,'Cancel retained renderer')
        console.log('PASS cancel kills pending engine renderer and all its workers')
        fixture.show();await wait(500)
        const selected=ocr.capture({id:'region',mode:'region',language:'eng'})
        const overlay=await until(()=>BrowserWindow.getAllWindows().find(w=>{const b=w.getBounds();return w!==fixture&&w.isVisible()&&b.x===captureDisplay.bounds.x&&b.y===captureDisplay.bounds.y&&b.width===captureDisplay.bounds.width}))
        const b=overlay.getBounds(),r=fixture.getBounds()
        const region={x:(r.x-b.x+10)/b.width,y:(r.y-b.y+10)/b.height,width:(r.width-20)/b.width,height:(r.height-20)/b.height}
        await overlay.webContents.executeJavaScript('void(async()=>{const rect='+JSON.stringify(region)+';const c=document.getElementById("desktop"),x=Math.floor(rect.x*c.width),y=Math.floor(rect.y*c.height),width=Math.min(c.width-x,Math.ceil((rect.x+rect.width)*c.width)-x),height=Math.min(c.height-y,Math.ceil((rect.y+rect.height)*c.height)-y);const crop=document.createElement("canvas");crop.width=width;crop.height=height;crop.getContext("2d").drawImage(c,x,y,width,height,0,0,width,height);const blob=await new Promise(ok=>crop.toBlob(ok));await window.ocrHelper.select({rect,bytes:new Uint8Array(await blob.arrayBuffer())})})()')
        const captured=await selected
        assert(captured?.text.includes('DevFusion SCREEN OCR 123'),'Known OS fixture region OCR failed: '+captured?.text)
        const popup=await until(()=>BrowserWindow.getAllWindows().find(w=>w!==fixture&&w.isVisible()))
        assert(await popup.webContents.executeJavaScript('!!window.ocrHelper && !window.devutils && document.getElementById("text").value.includes("DevFusion SCREEN OCR 123")'),'Minimal result popup missing')
        assert(popup.webContents.getURL().startsWith('file:'),'Result retained heavy engine document')
        assert(await popup.webContents.executeJavaScript('(()=>{const image=document.querySelector(".brand img"),r=image.getBoundingClientRect();return image.naturalWidth>0&&r.width===24&&r.height===24&&getComputedStyle(image).objectFit==="contain"})()'),'OCR result product logo missing or distorted')
        await popup.webContents.executeJavaScript('document.getElementById("close").click()')
        await until(()=>BrowserWindow.getAllWindows().length===1)
        console.log('PASS actual OS fixture region → lightweight result popup → Close releases helpers')
        const fullscreenDisplay=screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
        fixture.setBounds(fullscreenDisplay.bounds);fixture.setFullScreen(true);fixture.show()
        await fixture.webContents.executeJavaScript('document.body.textContent="DevFusion FULL SCREEN OCR 456";document.body.style.cssText="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;color:black;background:white;font:64px Arial"')
        await wait(800)
        assert(fixture.isFullScreen() && BrowserWindow.getAllWindows().length===1,'Full-screen fixture did not cover the desktop')
        const full=await ocr.capture({id:'full-screen',mode:'screen',language:'eng'})
        assert(/DevFusion\\s+FULL\\s+SCREEN\\s+OCR\\s+456/.test(full?.text),'Full-screen fixture OCR failed')
        const fullPopup=await until(()=>BrowserWindow.getAllWindows().find(w=>w!==fixture&&w.isVisible()))
        await fullPopup.webContents.executeJavaScript('document.getElementById("close").click()')
        await until(()=>BrowserWindow.getAllWindows().length===1)
        console.log('PASS full current-screen capture using an app-owned fullscreen fixture')
        ocr.dispose();fixture.destroy()
        await until(()=>app.getAppMetrics().filter(item=>item.type==='Tab').length===0)
        await wait(2000)
        console.log('PASS zero idle OCR windows and renderer processes after closing results')
        clearInterval(meter);console.log('OCR FIXTURE MEMORY cold='+JSON.stringify(cold)+' peakMiB='+peak+' idleAfter='+JSON.stringify(memory()))
        console.log('OCR IDLE PROCESS MEMORY '+JSON.stringify(app.getAppMetrics().map(item=>({type:item.type,rssMiB:Math.round((item.memory?.workingSetSize??0)/1024)}))))
        app.exit(0)
      }catch(error){clearInterval(meter);console.error('SMOKE FAILED',error.stack);ocr?.dispose();for(const w of BrowserWindow.getAllWindows())if(!w.isDestroyed())w.destroy();app.exit(1)}
    })
  `
  await build({ stdin: { contents: source, resolveDir: process.cwd(), loader: 'ts' }, outfile: entry, bundle: true, platform: 'node', format: 'cjs', packages: 'external', alias: { '@shared': resolve('src/shared') } })
  const electron = createRequire(import.meta.url)('electron')
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(electron, [entry, ...(process.argv.includes('--inline-only') ? ['--inline-only'] : [])], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.pipe(process.stdout); child.stderr.pipe(process.stderr)
  let timer
  const code = await new Promise((done, reject) => {
    timer = setTimeout(() => { child.kill(); reject(new Error('Native OCR smoke exceeded 150 seconds')) }, 150000)
    child.once('error', reject); child.once('exit', done)
  }).finally(() => clearTimeout(timer))
  if (code !== 0) throw new Error('Native OCR smoke exited ' + code)
} finally {
  const target = resolve(root)
  if (!target.startsWith(resolve(tmpdir()) + sep) || !basename(target).startsWith('devfusion-ocr-')) throw new Error('Unexpected cleanup path')
  await rm(target, { recursive: true, force: true })
}
