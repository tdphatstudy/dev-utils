import { app, BrowserWindow, nativeTheme, screen } from 'electron'
import { join } from 'node:path'
import type { QuickWidget } from '@shared/quick-tools'
import { appWindowIcon } from '../branding'

export function createQuickWindow(kind: QuickWidget): BrowserWindow {
  let display = screen.getPrimaryDisplay()
  try { display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()) } catch { /* Wayland has no global cursor position. */ }
  const area = display.workArea
  const width = Math.min(kind === 'clipboard' ? 620 : kind === 'mock' || kind === 'ocr' ? 540 : 460, area.width)
  const height = Math.min(kind === 'clipboard' ? 600 : 540, area.height)
  const win = new BrowserWindow({
    width, height,
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + (area.height - height) / 2),
    minWidth: Math.min(380, width), minHeight: Math.min(320, height),
    icon: appWindowIcon(), title: 'DevFusion · Quick tools',
    frame: false, show: false, resizable: true, minimizable: false, maximizable: false,
    alwaysOnTop: true, skipTaskbar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#f5f6f9',
    webPreferences: {
      preload: join(__dirname, '../preload/quickTools.js'), partition: 'quick-tools',
      sandbox: true, contextIsolation: true, webSecurity: true, nodeIntegration: false,
      devTools: !app.isPackaged,
      spellcheck: false, backgroundThrottling: true
    }
  })
  win.setMenu(null)
  win.setAlwaysOnTop(true, 'floating')
  return win
}
