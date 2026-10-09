import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { MOCK_LIMITS } from '@shared/mock-api/types'
import type { QuickTools } from './service'
import type { ClipboardManager } from '../clipboard/service'
import type { ScreenColorPicker } from '../color-picker'
import type { DesktopOcr } from '../ocr'
import type { MockApiServer } from '../mock-api-server'
import type { GlobalShortcuts } from '../global-shortcuts'
import { registerClipboardIpc } from '../clipboard/ipc'
import { IpcTaskPool } from '../ipc-task-pool'

export function registerQuickToolsIpc(quick: QuickTools, clipboard: ClipboardManager, picker: ScreenColorPicker, ocr: DesktopOcr, mockApi: MockApiServer | undefined, shortcuts: GlobalShortcuts): void {
  const shortcutWrites = new IpcTaskPool(1, 'Shortcut settings are being saved. Wait for completion.')
  const clipboardWrites = new IpcTaskPool(1, 'A clipboard copy is already running. Wait for completion.')
  const caller = (e: IpcMainInvokeEvent): void => quick.assertCaller(e)
  ipcMain.handle('quick:open', (e, kind: unknown) => { caller(e); return quick.open(kind) })
  ipcMain.handle('quick:context', e => quick.context(e))
  ipcMain.handle('quick:close', e => { quick.assertWidget(e); quick.close() })
  ipcMain.handle('quick:pin', (e, value: unknown) => { quick.assertWidget(e); if (typeof value !== 'boolean') throw new Error('Invalid widget pin.'); quick.pin(value) })
  ipcMain.handle('quick:pick', e => { quick.assertWidget(e); return quick.pick() })
  ipcMain.handle('quick:lastColor', e => { quick.assertWidget(e); return picker.getLast() })
  ipcMain.handle('quick:copyText', (e, value: unknown) => { quick.assertWidget(e); return clipboardWrites.run(() => clipboard.copyText(value, true)) })
  ipcMain.handle('quick:copyImage', (e, value: unknown) => { quick.assertWidget(e); return clipboardWrites.run(() => clipboard.copyImage(value)) })
  ipcMain.handle('quick:ocr', (e, value: unknown) => { quick.assertWidget(e); return quick.recognizeRequest(value, e) })
  ipcMain.handle('quick:ocrCapture', (e, mode: unknown) => { quick.assertWidget(e); return quick.capture(mode) })
  ipcMain.handle('quick:ocrCancel', (e, id: unknown) => { quick.assertWidget(e); return ocr.cancel(id, e.sender) })
  const server = (e: IpcMainInvokeEvent): MockApiServer => { quick.assertWidget(e); if (!mockApi) throw new Error('Mock API requires the desktop app.'); return mockApi }
  ipcMain.handle('quick:mockStatus', e => server(e).status())
  ipcMain.handle('quick:mockConfig', e => server(e).getConfig())
  ipcMain.handle('quick:mockStop', e => server(e).stop())
  ipcMain.handle('quick:mockStart', (e, value: unknown) => {
    const mock = server(e)
    if (typeof value !== 'string' || Buffer.byteLength(value) > MOCK_LIMITS.yamlBytes) throw new Error('Mock API YAML must be a string of at most 1 MiB.')
    return mock.start(value)
  })
  ipcMain.handle('quick:shortcuts', e => { caller(e); return shortcuts.state() })
  ipcMain.handle('quick:setShortcuts', (e, value: unknown) => { caller(e); return shortcutWrites.run(() => shortcuts.set(value)) })
  ipcMain.handle('quick:checkShortcut', (e, value: unknown) => { caller(e); return shortcuts.check(value) })

  registerClipboardIpc(clipboard, quick, clipboardWrites)
}
