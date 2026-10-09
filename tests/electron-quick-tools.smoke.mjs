import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, cp, copyFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join, sep } from 'node:path'
import { spawn } from 'node:child_process'
// Real Electron/file-URL/sandbox/global-shortcut registration. Clipboard IO is
// injected with fixture text; no real clipboard, screen capture or vault is used.
const root = await mkdtemp(join(tmpdir(),'devfusion-quick-smoke-'))
try {
  await mkdir(join(root,'main','resources'),{recursive:true}); await mkdir(join(root,'preload'))
  await cp(resolve('out/renderer'),join(root,'renderer'),{recursive:true,filter:path=>!path.includes('ocr-assets')})
  for(const name of ['icon.ico','icon.png']) await copyFile(resolve('resources',name),join(root,'main','resources',name))
  await cp(resolve('resources/menu-icons'),join(root,'main','resources/menu-icons'),{recursive:true})
  await copyFile(resolve('out/preload/quickTools.js'),join(root,'preload/quickTools.js'))
  const entry=join(root,'main','smoke.cjs'), source=`
    import { app, BrowserWindow, globalShortcut, nativeImage, nativeTheme } from 'electron'
    import { readFile } from 'node:fs/promises'
    import { ClipboardManager } from './src/main/clipboard/service'
    import { QuickTools } from './src/main/quick-tools'
    import { GlobalShortcuts } from './src/main/global-shortcuts'
    import { LanguagePreferences } from './src/main/language'
    import { LOCALES } from './src/shared/i18n/locales'
    import { translate } from './src/shared/i18n/catalog'
    import { menuIcon } from './src/main/menu-icons'
    import { DEFAULT_CLIPBOARD } from './src/shared/clipboard/types'
    const root=${JSON.stringify(root)}, assert=(ok,message)=>{if(!ok)throw new Error(message)}
    console.log('Native quick fixture boot')
    app.setPath('userData',root); app.setPath('sessionData',root); app.setPath('crashDumps',root)
    app.on('window-all-closed',()=>{})
    const wait=ms=>new Promise(done=>setTimeout(done,ms))
    const bounded=async promise=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Native inspection did not resolve')),5000))])
    const until=async read=>{for(let i=0;i<200;i++){const result=await bounded(Promise.resolve().then(read));if(result)return result;await wait(25)}throw new Error('Native widget wait timed out')}
    let manager,quick,shortcuts, input={text:'baseline'}, copies=[]
    app.whenReady().then(async()=>{
      try {
        console.log('Native quick fixture ready')
        manager=new ClipboardManager(root,()=>quick?.notify(),()=>false,async()=>input,async c=>copies.push(c))
        await manager.start(); console.log('Native clipboard service ready'); await manager.configure({...DEFAULT_CLIPBOARD,enabled:true}); await manager.poll()
        input={text:'{ "count":9007199254740993, "count":2 }'}; await manager.poll()
        let picks=0
        const language=new LanguagePreferences(root,()=>['en'],()=>quick?.notifyLanguage())
        await language.start()
        quick=new QuickTools(manager,{isBusy:()=>false,getLast:()=> '#FF8800',pickFromTray:async()=>{picks++}},{isBusy:()=>false},()=>language.state().resolved,undefined,{capture:async()=>null,paste:async()=>{throw Error('No fixture target')}})
        shortcuts=new GlobalShortcuts(root,()=>quick.open('clipboard'))
        await shortcuts.start(); console.log('Native global shortcuts ready')
        assert(BrowserWindow.getAllWindows().length===0,'Idle allocated a renderer')
        const bindings={clipboard:'Ctrl+Alt+Shift+F10',color:null,ocr:null,transform:null}
        await shortcuts.set(bindings)
        assert(globalShortcut.isRegistered('Control+Alt+Shift+F10'),'Native OS registration failed')
        quick.register(shortcuts)
        await quick.open('color'); assert(picks===1 && BrowserWindow.getAllWindows().length===0,'Color opened an intermediate widget instead of immediately picking')
        await quick.open('clipboard'); console.log('Native quick window loaded')
        let win=BrowserWindow.getAllWindows()[0]
        win.webContents.on('console-message',(_e,...args)=>console.log('Native renderer console',...args))
        await until(()=>win.webContents.executeJavaScript('Boolean(document.querySelector(".clip-row"))'))
        console.log('Native clipboard row visible')
        assert(await win.webContents.executeJavaScript('Boolean(window.quickTools && !window.devutils && !window.require && !window.process)'), 'Sandbox bridge isolation failed')
        await win.webContents.executeJavaScript('window.quickTools.pin(true)')
        nativeTheme.themeSource='light'; quick.notifyAppearance()
        await until(()=>win.webContents.executeJavaScript('!document.documentElement.classList.contains("dark")'))
        nativeTheme.themeSource='dark'; quick.notifyAppearance()
        await until(()=>win.webContents.executeJavaScript('document.documentElement.classList.contains("dark")'))
        console.log('Native widget pin verified')
        assert(await win.webContents.executeJavaScript('document.querySelector(".quick-header img").naturalWidth>0'),'Widget logo missing')
        await win.webContents.executeJavaScript('Array.from(document.querySelector(".clip-kind-json").closest(".clip-row").querySelectorAll("button")).find(b=>b.title==="Preview entry").click()')
        await until(()=>win.webContents.executeJavaScript('Boolean(document.querySelector(".clip-transform select"))'))
        await win.webContents.executeJavaScript('Array.from(document.querySelectorAll(".clip-transform select"))[0].value="json-minify"; document.querySelector(".clip-transform select").dispatchEvent(new Event("change",{bubbles:true}))')
        console.log('Native transformation selected')
        await until(()=>win.webContents.executeJavaScript('document.querySelector(".clip-text").value.includes("9007199254740993")'))
        // The action destroys its own WebContents; no evaluation reply is promised.
        void win.webContents.executeJavaScript('Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="Copy & close").click()').catch(()=>{})
        console.log('Native copy invoked')
        await until(()=>win.isDestroyed())
        assert(copies.at(-1).text==='{"count":9007199254740993,"count":2}','Native exact clipboard transformation failed')
        assert(BrowserWindow.getAllWindows().length===0 && globalShortcut.isRegistered('Control+Alt+Shift+F10'),'Shortcut did not survive closing every window')
        console.log('PASS native OS global registration survives all windows closed; file-URL widget, sandbox preload and exact JSON copy')
        await quick.open('random'); win=BrowserWindow.getAllWindows()[0]
        await until(()=>win.webContents.executeJavaScript('Boolean(document.querySelector(".quick-card"))'))
        await win.webContents.executeJavaScript('document.querySelector(".quick-header button").click()')
        await until(()=>win.webContents.executeJavaScript('document.querySelector(".quick-header button").getAttribute("aria-pressed")==="true"'))
        const uuid=await win.webContents.executeJavaScript('document.querySelector("textarea").value')
        assert(await win.webContents.executeJavaScript('['+
          '()=>window.quickTools.clipboard.onChanged(()=>{}),'+
          '()=>window.quickTools.onShortcutsChanged(()=>{}),'+
          '()=>window.quickTools.onAppearanceChanged(()=>{}),'+
          '()=>window.quickTools.onPasteTargetChanged(()=>{}),'+
          '()=>window.quickTools.ocr.onProgress(()=>{})'+
          '].every(subscribe=>{const off=subscribe();return off()===undefined&&off()===undefined})'),'Quick unsubscribe exposed a bridge object or failed on repetition')
        await win.webContents.executeJavaScript('window.__languageEvents=[]; window.__languageStop=window.quickTools.onLanguageChanged(value=>window.__languageEvents.push(value)); true')
        for(const malformed of [null,{},['ar'],{locale:'ar'},'system','AR','xx','vi\\n','en ','',42]) win.webContents.send('quick:languageChanged',malformed)
        for(const locale of LOCALES) {
          await language.set(locale.id)
          await until(()=>win.webContents.executeJavaScript('document.documentElement.lang==='+JSON.stringify(locale.id)))
          assert(await win.webContents.executeJavaScript('document.documentElement.dir==='+JSON.stringify(locale.direction)), 'Quick language direction did not update')
          assert(await win.webContents.executeJavaScript('document.querySelector("h1").textContent==='+JSON.stringify(translate(locale.id,'Secure Random / UUID'))), 'Quick title did not update')
          assert(await win.webContents.executeJavaScript('document.querySelector("textarea").value==='+JSON.stringify(uuid)), 'Language change modified generated content')
          assert(await win.webContents.executeJavaScript('document.querySelector(".quick-header button").getAttribute("aria-pressed")==="true"'), 'Language change lost pin state')
        }
        assert(JSON.stringify(await win.webContents.executeJavaScript('window.__languageEvents'))===JSON.stringify(LOCALES.map(locale=>locale.id)), 'Quick subscription accepted an invalid language payload')
        assert(await win.webContents.executeJavaScript('window.__languageStop()===undefined && window.__languageStop()===undefined'),'Quick unsubscribe exposed a bridge object')
        await language.set('system')
        await until(()=>win.webContents.executeJavaScript('document.documentElement.lang==="en"'))
        assert(await win.webContents.executeJavaScript('window.__languageEvents.length')===LOCALES.length,'Unsubscribed quick language listener was called')
        console.log('PASS live quick language events across 13 locales, RTL, payload validation, content/pin preservation and subscription cleanup')
        let refused=false; try { await win.webContents.executeJavaScript('window.quickTools.open("file:///C:/Windows")') } catch {refused=true}
        assert(refused,'Arbitrary quick target accepted')
        const glyph=menuIcon('clipboard'), bitmap=glyph.toBitmap(); let colored=false
        for(let i=0;i<bitmap.length;i+=4)if(bitmap[i+3]>64&&(Math.abs(bitmap[i]-bitmap[i+1])>30||Math.abs(bitmap[i+1]-bitmap[i+2])>30)){colored=true;break}
        assert(!glyph.isEmpty() && glyph.getSize().width===16 && glyph.getSize().height===16 && colored, 'Native menu glyph is missing, distorted or monochrome')
        const logo=await readFile(root+'/main/resources/icon.png'); await win.webContents.executeJavaScript('window.quickTools.copyImage('+JSON.stringify(logo.toString('base64'))+')')
        assert(copies.at(-1).png===logo.toString('base64'),'Bounded native PNG copy failed')
        assert(!nativeImage.createFromPath(${JSON.stringify(join(root,'main','resources','icon.ico'))}).isEmpty(),'Native product icon missing')
        await manager.configure({...DEFAULT_CLIPBOARD,enabled:true,persist:true}); await manager.flush()
        const encrypted=await readFile(root+'/clipboard-history.enc')
        assert(!encrypted.includes(Buffer.from('9007199254740993')),'OS encrypted history leaked plaintext')
        console.log('PASS actual OS-backed async encrypted history in the temporary fixture profile')
        quick.close();await language.set('ar');assert(BrowserWindow.getAllWindows().length===0,'Language update allocated an idle renderer');shortcuts.dispose();await manager.dispose()
        assert(!globalShortcut.isRegistered('Control+Alt+Shift+F10'),'Quit leaked registration')
        console.log('PASS native resource icons, fixed quick targets, renderer cleanup and shortcut release; system clipboard unchanged')
        app.exit(0)
      } catch(error){console.error(error);quick?.close();shortcuts?.dispose();await manager?.dispose();app.exit(1)}
    })
  `
  await build({stdin:{contents:source,resolveDir:resolve('.'),sourcefile:'native-quick-fixture.ts',loader:'ts'},outfile:entry,bundle:true,platform:'node',format:'cjs',target:'node20',external:['electron'],alias:{'@shared':resolve('src/shared')},define:{__dirname:JSON.stringify(join(root,'main'))}})
  const require=createRequire(import.meta.url), electron=require('electron'), env={...process.env}; delete env.ELECTRON_RUN_AS_NODE
  const code=await new Promise((done,reject)=>{const child=spawn(electron,[entry],{env,stdio:'inherit',windowsHide:true});const timer=setTimeout(()=>{child.kill();reject(new Error('Native quick tools timeout'))},60000);child.on('error',reject);child.on('exit',code=>{clearTimeout(timer);done(code)})})
  if(code!==0)throw new Error('Native quick tools exited '+code)
} finally {
  // Cleanup is limited to the mkdtemp fixture and never uses a user path.
  if(!root.startsWith(tmpdir()+sep))throw new Error('Unsafe fixture cleanup path')
  await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100})
}
