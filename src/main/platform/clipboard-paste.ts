import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execute = promisify(execFile)
export interface PasteTarget { windowId: string; pid: number }
export interface PasteAdapter { capture(): Promise<PasteTarget | null>; paste(target: PasteTarget): Promise<void> }
const unavailable = 'Direct paste is unavailable. Copy the entry and paste it in your target app.'

// Only window identity crosses the process boundary; clipboard contents never
// appear in command arguments, stdout or logs. No renderer can supply a target.
export const WINDOWS_PASTE_API = `
using System;
using System.Runtime.InteropServices;
using System.Threading;
public static class DevFusionPaste {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint from, uint to, bool attach);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll", SetLastError=true)] static extern uint SendInput(uint count, INPUT[] inputs, int size);
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public UNION data; }
  [StructLayout(LayoutKind.Explicit)] struct UNION {
    [FieldOffset(0)] public KEYBOARD keyboard;
    [FieldOffset(0)] public MOUSE mouse;
  }
  [StructLayout(LayoutKind.Sequential)] struct KEYBOARD { public ushort key, scan; public uint flags, time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct MOUSE { public int x, y; public uint data, flags, time; public UIntPtr extra; }
  static INPUT Key(ushort key, bool up) { return new INPUT { type=1, data=new UNION { keyboard=new KEYBOARD { key=key, flags=up ? 2u : 0u } } }; }
  public static void Paste(long id, uint expectedPid) {
    IntPtr hwnd = new IntPtr(id); uint pid;
    GetWindowThreadProcessId(hwnd, out pid);
    if (!IsWindow(hwnd) || pid != expectedPid) throw new Exception("Paste target closed or changed.");
    if (!SetForegroundWindow(hwnd)) {
      uint foregroundPid;
      uint foregroundThread = GetWindowThreadProcessId(GetForegroundWindow(), out foregroundPid);
      uint currentThread = GetCurrentThreadId();
      bool attached = foregroundThread!=0 && foregroundThread!=currentThread && AttachThreadInput(currentThread, foregroundThread, true);
      try { SetForegroundWindow(hwnd); }
      finally { if (attached) AttachThreadInput(currentThread, foregroundThread, false); }
    }
    for (int i=0; i<40 && GetForegroundWindow()!=hwnd; i++) Thread.Sleep(25);
    if (GetForegroundWindow()!=hwnd) throw new Exception("Could not restore the paste target.");
    // Wait for the hotkey/click modifiers to be released. Never release keys
    // held by the user or send an altered shortcut to a different foreground.
    int[] modifiers = { 0x10, 0x11, 0x12, 0x5B, 0x5C };
    for (int i=0; i<40; i++) {
      bool held=false; foreach (int key in modifiers) held |= (GetAsyncKeyState(key)&0x8000)!=0;
      if (!held) {
        GetWindowThreadProcessId(hwnd, out pid);
        if (GetForegroundWindow()!=hwnd || pid!=expectedPid) throw new Exception("Paste target changed.");
        INPUT[] keys = { Key(0x11,false), Key(0x56,false), Key(0x56,true), Key(0x11,true) };
        if (SendInput(4, keys, Marshal.SizeOf(typeof(INPUT)))!=4) throw new Exception("Paste blocked by Windows permissions.");
        return;
      }
      Thread.Sleep(25);
    }
    throw new Exception("Release the shortcut keys and try again.");
  }
}`
function powershell(script: string): Promise<{ stdout: string }> {
  return execute('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 6000, maxBuffer: 4096 })
}
const winScript = (body: string): string => `$ErrorActionPreference='Stop'\nAdd-Type -TypeDefinition @'\n${WINDOWS_PASTE_API}\n'@\n${body}`
export function parsePasteTarget(windowId: string, processId: string): PasteTarget {
  const pid = Number(processId.trim()), id = windowId.trim()
  if (!/^\d{1,20}$/.test(id) || BigInt(id) <= 0 || BigInt(id) > 9223372036854775807n || !Number.isSafeInteger(pid) || pid <= 0) throw new Error(unavailable)
  return { windowId: id, pid }
}
export class DesktopPaste implements PasteAdapter {
  async capture(): Promise<PasteTarget | null> {
    try {
      let target: PasteTarget
      if (process.platform === 'win32') {
        const { stdout } = await powershell(winScript('$handle=[DevFusionPaste]::GetForegroundWindow(); [uint32]$targetPid=0; [void][DevFusionPaste]::GetWindowThreadProcessId($handle,[ref]$targetPid); Write-Output "$($handle.ToInt64()) $targetPid"'))
        const [id, pid] = stdout.trim().split(/\s+/); target = parsePasteTarget(id, pid)
      } else if (process.platform === 'darwin') {
        const { stdout } = await execute('/usr/bin/osascript', ['-e', 'tell application "System Events" to get unix id of first application process whose frontmost is true'], { timeout: 3000, maxBuffer: 4096 })
        target = parsePasteTarget(stdout.trim(), stdout.trim())
      } else {
        if (process.env.XDG_SESSION_TYPE === 'wayland' || process.env.WAYLAND_DISPLAY) return null
        const { stdout } = await execute('xdotool', ['getactivewindow'], { timeout: 2000, maxBuffer: 4096 })
        const id = stdout.trim(); if (!/^\d{1,20}$/.test(id)) return null
        const processId = await execute('xdotool', ['getwindowpid', id], { timeout: 2000, maxBuffer: 4096 })
        target = parsePasteTarget(id, processId.stdout)
      }
      return target.pid === process.pid ? null : target
    } catch { return null }
  }
  async paste(target: PasteTarget): Promise<void> {
    const safe = parsePasteTarget(target.windowId, String(target.pid))
    if (safe.pid === process.pid) throw new Error(unavailable)
    try {
      if (process.platform === 'win32') await powershell(winScript(`[DevFusionPaste]::Paste(${safe.windowId},${safe.pid})`))
      else if (process.platform === 'darwin') await execute('/usr/bin/osascript', ['-e', `tell application "System Events"
set targetProcess to first application process whose unix id is ${safe.pid}
set frontmost of targetProcess to true
delay 0.15
if unix id of first application process whose frontmost is true is not ${safe.pid} then error "Paste target changed"
keystroke "v" using command down
end tell`], { timeout: 4000, maxBuffer: 4096 })
      else {
        if (process.env.XDG_SESSION_TYPE === 'wayland' || process.env.WAYLAND_DISPLAY) throw new Error(unavailable)
        const result = await execute('xdotool', ['getwindowpid', safe.windowId], { timeout: 2000, maxBuffer: 4096 })
        if (Number(result.stdout.trim()) !== safe.pid) throw new Error(unavailable)
        await execute('xdotool', ['windowactivate', '--sync', safe.windowId], { timeout: 2000, maxBuffer: 4096 })
        const active = await execute('xdotool', ['getactivewindow'], { timeout: 2000, maxBuffer: 4096 })
        if (active.stdout.trim() !== safe.windowId) throw new Error(unavailable)
        await execute('xdotool', ['key', 'ctrl+v'], { timeout: 2000, maxBuffer: 4096 })
      }
    } catch { throw new Error('Could not paste into the previous app. The entry is copied; use your paste shortcut there. Elevated apps may block direct paste.') }
  }
}
