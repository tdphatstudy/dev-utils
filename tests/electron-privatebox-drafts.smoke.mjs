import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join, sep, basename } from 'node:path'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'

const directory = await mkdtemp(join(tmpdir(), 'devfusion-native-drafts-'))
const require = createRequire(import.meta.url)
try {
  const preload = join(directory, 'preload.cjs'), entry = join(directory, 'fixture.cjs')
  await writeFile(preload, `
    const { contextBridge, ipcRenderer } = require('electron')
    contextBridge.exposeInMainWorld('devutils', {
      platform: async () => 'win32', app: { onOpenTool: () => () => {}, trayAvailable: async () => true, language: async () => ({language:'en',resolved:'en'}) },
      privateBox: {
        getStatus: () => ipcRenderer.invoke('fixture:status'), list: () => ipcRenderer.invoke('fixture:list'),
        readFile: () => ipcRenderer.invoke('fixture:read'), writeFile: (_path,content) => ipcRenderer.invoke('fixture:write',content), clearAccess: async () => {}
      }
    })
  `)
  await writeFile(entry, `
    const { app, BrowserWindow, ipcMain } = require('electron')
    const directory = ${JSON.stringify(directory)}, renderer = ${JSON.stringify(resolve('out/renderer/index.html'))}, preload = ${JSON.stringify(preload)}
    app.setPath('userData',directory); app.setPath('sessionData',directory); app.setPath('crashDumps',directory)
    app.on('window-all-closed',()=>{})
    const doc = {id:'native-doc',name:'Native fixture.txt',type:'text',encoding:'utf-8',relativePath:'native.putl',content:'Saved original',sessionId:'native-session',updatedAt:'2026-10-09T00:00:00Z'}
    const vault = {id:'native-box',name:'Native fixture',rootPath:'fixture-only',mode:'device',createdAt:doc.updatedAt}
    const state = {delay:false,finish:null}; let win, blocked = 0, discard = false
    const sleep = ms => new Promise(done=>setTimeout(done,ms))
    const assert = (value,message) => {if(!value)throw new Error(message)}
    const js = source => win.webContents.executeJavaScript(source)
    const wait = async source => { const until=Date.now()+12000; while(Date.now()<until){if(await js(source))return;await sleep(30)}throw new Error('Native draft fixture timed out: '+source) }
    ipcMain.handle('fixture:status',()=>({configured:true,hasAccess:true,mode:'device',rootPath:vault.rootPath,activeId:vault.id,vaults:[vault],sessionId:doc.sessionId}))
    ipcMain.handle('fixture:list',()=>[{...doc,kind:'file'}]); ipcMain.handle('fixture:read',()=>({...doc}))
    ipcMain.handle('fixture:write',async(_event,content)=>{if(state.delay){state.delay=false;await new Promise(done=>state.finish=done)}doc.content=content;return {...doc}})
    app.whenReady().then(async()=>{
      try {
        win = new BrowserWindow({show:false,width:1180,height:760,webPreferences:{preload,sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,backgroundThrottling:false}})
        win.webContents.on('will-prevent-unload',event=>{blocked++;if(discard)event.preventDefault()})
        await win.loadFile(renderer,{hash:'/tool/privatebox.home'})
        await wait('[...document.querySelectorAll("button")].some(button=>button.getAttribute("aria-label")==="Native fixture.txt")')
        await js('[...document.querySelectorAll("button")].find(button=>button.getAttribute("aria-label")==="Native fixture.txt").dispatchEvent(new MouseEvent("dblclick",{bubbles:true}))')
        await wait('!!document.querySelector(".cm-content[contenteditable=true]")')
        await js('document.querySelector(".cm-content").focus()'); win.webContents.insertText('Unsaved native draft ')
        await wait('[...document.querySelectorAll("button")].some(button=>button.textContent.trim()==="Save"&&!button.disabled)')
        win.close(); await sleep(250)
        assert(!win.isDestroyed()&&blocked===1,'Dirty native close did not preserve the window')
        win.webContents.reload(); await sleep(250)
        assert(!win.isDestroyed()&&blocked===2,'Dirty native reload did not preserve the renderer')
        assert(await js('document.querySelector(".cm-content").textContent.includes("Unsaved native draft")'),'Native close/reload erased unsaved content')
        state.delay = true
        await js('[...document.querySelectorAll("button")].find(button=>button.textContent.trim()==="Save").click()')
        while(!state.finish)await sleep(20)
        win.close(); await sleep(250)
        assert(!win.isDestroyed()&&blocked===3,'Native close during Save did not stay blocked')
        state.finish(); await wait('[...document.querySelectorAll("button")].some(button=>button.textContent.trim()==="Save"&&button.disabled)')
        await js('document.querySelector(".cm-content").focus()'); win.webContents.insertText('More unsaved text ')
        await wait('[...document.querySelectorAll("button")].some(button=>button.textContent.trim()==="Save"&&!button.disabled)')
        discard=true; win.close(); await sleep(250)
        assert(win.isDestroyed()&&blocked===4,'Explicit native discard did not close the window')
        console.log('PASS native Electron dirty close/reload, Save-in-flight protection, preserved editor and explicit discard')
        app.exit(0)
      } catch(error){ console.error(error); if(win&&!win.isDestroyed())win.destroy();app.exit(1) }
    })
  `)
  const electron = require('electron')
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const result = await new Promise((done, reject) => {
    const child = spawn(electron, [entry], { windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.on('data', data => process.stdout.write(data)); child.stderr.on('data', data => process.stderr.write(data))
    const deadline = setTimeout(() => { child.kill(); reject(new Error('Native draft smoke exceeded 60 seconds')) }, 60000)
    child.on('error', error => { clearTimeout(deadline); reject(error) }); child.on('exit', code => { clearTimeout(deadline); done(code) })
  })
  if (result !== 0) throw new Error('Native draft smoke failed: ' + result)
} finally {
  const target = resolve(directory), temporary = resolve(tmpdir())
  if (!target.startsWith(temporary + sep) || !basename(target).startsWith('devfusion-native-drafts-')) throw new Error('Refusing cleanup outside the fixture directory')
  await rm(target, { recursive: true, force: true })
}
