import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, cp, copyFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join, sep } from 'node:path'
import { spawn } from 'node:child_process'

// A separate Windows input process intercepts WM_PASTE without reading or
// changing the system clipboard. This verifies real focus restoration/SendInput.
if (process.platform !== 'win32') { console.log('SKIP Windows native paste fixture'); process.exit(0) }
const root = await mkdtemp(join(tmpdir(), 'devfusion-paste-smoke-'))
try {
  await mkdir(join(root, 'main', 'resources'), { recursive: true }); await mkdir(join(root, 'preload'))
  await cp(resolve('out/renderer'), join(root, 'renderer'), { recursive: true, filter: path => !path.includes('ocr-assets') })
  await copyFile(resolve('resources/icon.ico'), join(root, 'main/resources/icon.ico'))
  await copyFile(resolve('out/preload/quickTools.js'), join(root, 'preload/quickTools.js'))
  const targetScript = `$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Windows.Forms;
using System.Diagnostics;
public class PasteFixtureInput : TextBox {
  protected override void WndProc(ref Message message) {
    if (message.Msg == 0x302) {
      SelectedText = "PASTE";
      Console.WriteLine("PASTED:" + Text + ":" + SelectionStart);
      return;
    }
    base.WndProc(ref message);
  }
}
public static class PasteFixture {
  [STAThread] public static void Run() {
    var form = new Form { Text="DevFusion paste test", Width=340, Height=120, StartPosition=FormStartPosition.CenterScreen };
    var input = new PasteFixtureInput { Text="before after", Dock=DockStyle.Fill };
    form.Controls.Add(input);
    form.Shown += delegate { form.Activate(); input.Focus(); input.SelectionStart=7; input.SelectionLength=0; Console.WriteLine("READY:" + form.Handle.ToInt64() + ":" + Process.GetCurrentProcess().Id); };
    var timer = new Timer { Interval=25000 }; timer.Tick += delegate { form.Close(); }; timer.Start();
    Application.Run(form);
  }
}
'@ -ReferencedAssemblies System.Windows.Forms
[PasteFixture]::Run()`
  const entry = join(root, 'main/smoke.cjs')
  const clickApi = `
using System;
using System.Runtime.InteropServices;
public static class FixtureClick {
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int x,y; }
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int left,top,right,bottom; }
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(POINT point);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr hwnd,uint flags);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hwnd,out RECT rect);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT point);
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x,int y);
  [DllImport("user32.dll")] static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra);
  public static void Click(long id) {
    SetProcessDPIAware();
    IntPtr hwnd=new IntPtr(id); RECT rect; POINT original;
    if (!GetWindowRect(hwnd,out rect) || !GetCursorPos(out original)) throw new Exception("Fixture bounds unavailable");
    POINT point=new POINT {x=(rect.left+rect.right)/2,y=rect.top+20};
    if (GetAncestor(WindowFromPoint(point),2)!=hwnd) throw new Exception("Fixture is occluded; refusing click");
    try { SetCursorPos(point.x,point.y); mouse_event(2,0,0,0,UIntPtr.Zero); mouse_event(4,0,0,0,UIntPtr.Zero); }
    finally { SetCursorPos(original.x,original.y); }
  }
}`
  const source = `
    import { app, BrowserWindow } from 'electron'
    import { spawn, execFile } from 'node:child_process'
    import { promisify } from 'node:util'
    import { DesktopPaste } from './src/main/platform/clipboard-paste'
    import { QuickTools } from './src/main/quick-tools'
    import { ClipboardManager } from './src/main/clipboard/service'
    const root=${JSON.stringify(root)}, script=${JSON.stringify(targetScript)}
    app.setPath('userData',root); app.setPath('sessionData',root)
    app.on('window-all-closed',()=>{})
    const assert=(ok,message)=>{if(!ok)throw Error(message)}
    const wait=ms=>new Promise(done=>setTimeout(done,ms))
    const until=async read=>{for(let i=0;i<200;i++){if(await read())return;await wait(50)}throw Error('Paste fixture timeout')}
    let target,manager,quick,output='',copies=[]
    app.whenReady().then(async()=>{
      try {
        target=spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-STA','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,stdio:['ignore','pipe','pipe']})
        target.stdout.on('data',chunk=>{output+=chunk.toString()});target.stderr.on('data',chunk=>console.error(chunk.toString()))
        await until(()=>output.includes('READY:'))
        console.log('Native paste target ready')
        manager=new ClipboardManager(root,()=>quick?.notify(),()=>false,async()=>({text:'fixture'}),async content=>copies.push(content));await manager.start()
        const adapter=new DesktopPaste(), expected=output.match(/READY:(\\d+):(\\d+)/)
        // Supply only our known native fixture identity: the background test
        // runner cannot assume which real app currently has foreground focus.
        const paste={capture:async()=>({windowId:expected[1],pid:Number(expected[2])}),paste:target=>adapter.paste(target)}
        quick=new QuickTools(manager,{isBusy:()=>false},{isBusy:()=>false},()=> 'en',undefined,paste);quick.register({})
        await quick.open('clipboard');const win=BrowserWindow.getAllWindows()[0]
        await until(()=>win.webContents.executeJavaScript('Boolean(document.querySelector(".clip-row"))'))
        // Simulate a user click only after checking that the exact fixture HWND
        // occupies the header point. Restore the pointer immediately afterwards.
        const handle=win.getNativeWindowHandle(), windowId=String(handle.length===8?handle.readBigUInt64LE():handle.readUInt32LE())
        const clickScript="$ErrorActionPreference='Stop'\\nAdd-Type -TypeDefinition @'\\n"+${JSON.stringify(clickApi)}+"\\n'@\\n[FixtureClick]::Click("+windowId+")"
        try {
          await promisify(execFile)('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(clickScript,'utf16le').toString('base64')],{windowsHide:true,timeout:6000,maxBuffer:8192})
        } catch(error) {
          if(error.stderr?.includes('Fixture is occluded')) {
            console.log('SKIP native paste dispatch: this background desktop cannot expose the fixture HWND for a safe user click. Manual foreground/Word verification remains required.')
            target.kill();quick.close();await manager.dispose();app.exit(2);return
          }
          throw Error('Native paste fixture could not receive its test click')
        }
        await wait(100)
        const context=await win.webContents.executeJavaScript('window.quickTools.context()')
        console.log('Native paste widget ready; target available:',context.canPaste)
        assert(context.canPaste,'Did not capture the external input target')
        void win.webContents.executeJavaScript('window.quickTools.clipboard.pasteText("fixture")').catch(error=>{if(!win.isDestroyed())console.error('Native paste bridge:',error.message)})
        await until(()=>output.includes('PASTED:before PASTEafter:12'))
        await until(()=>win.isDestroyed())
        assert(copies.at(-1).text==='fixture','Paste did not write the selected payload first')
        console.log('PASS Windows external input: original caret, native focus restoration, Ctrl+V dispatch and widget cleanup; real clipboard untouched')
        target.kill();await manager.dispose();app.exit(0)
      } catch(error){console.error(error);target?.kill();quick?.close();await manager?.dispose();app.exit(1)}
    })
  `
  await build({ stdin: { contents: source, resolveDir: resolve('.'), sourcefile: 'paste-fixture.ts', loader: 'ts' }, outfile: entry, bundle: true, platform: 'node', format: 'cjs', external: ['electron'], alias: { '@shared': resolve('src/shared') }, define: { __dirname: JSON.stringify(join(root, 'main')) } })
  const require = createRequire(import.meta.url), env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  const code = await new Promise((done, reject) => {
    const child = spawn(require('electron'), [entry], { env, stdio: 'inherit', windowsHide: true })
    const timer = setTimeout(() => { child.kill(); reject(Error('Native paste smoke timed out')) }, 45000)
    child.on('error', reject); child.on('exit', code => { clearTimeout(timer); done(code) })
  })
  if (code !== 0 && code !== 2) throw Error('Native paste smoke exited ' + code)
} finally {
  if (!root.startsWith(tmpdir() + sep)) throw Error('Unsafe fixture cleanup path')
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
