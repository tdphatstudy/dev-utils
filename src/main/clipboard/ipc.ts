import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { ClipboardManager } from './service'
import { IpcTaskPool } from '../ipc-task-pool'

interface ClipboardAccess {
  assertCaller(event: IpcMainInvokeEvent): void
  assertWidget(event: IpcMainInvokeEvent): void
  closeForSender(event: IpcMainInvokeEvent): void
  recognize(id: unknown, event: IpcMainInvokeEvent): Promise<string | null>
  paste(event: IpcMainInvokeEvent, write: () => Promise<void>): Promise<void>
}

export function registerClipboardIpc(clipboard: ClipboardManager, access: ClipboardAccess, copies: IpcTaskPool): void {
  const settings = new IpcTaskPool(1, 'Clipboard settings are being saved. Wait for completion.')
  const caller = (event: IpcMainInvokeEvent): void => access.assertCaller(event)
  ipcMain.handle('clipboard:state', e => { caller(e); return clipboard.state() })
  ipcMain.handle('clipboard:configure', (e, value: unknown) => { caller(e); return settings.run(() => clipboard.configure(value)) })
  ipcMain.handle('clipboard:pause', (e, value: unknown) => { caller(e); return clipboard.pause(value) })
  ipcMain.handle('clipboard:list', (e, query: unknown) => { caller(e); return clipboard.list(query) })
  ipcMain.handle('clipboard:content', (e, id: unknown) => { caller(e); return clipboard.content(id) })
  ipcMain.handle('clipboard:copy', async (e, id: unknown, mode: unknown, close: unknown) => { caller(e); if (close !== undefined && typeof close !== 'boolean') throw new Error('Invalid close option.'); await copies.run(() => clipboard.copy(id, mode)); if (close) access.closeForSender(e) })
  ipcMain.handle('clipboard:copyText', async (e, text: unknown, close: unknown) => { caller(e); if (close !== undefined && typeof close !== 'boolean') throw new Error('Invalid close option.'); await copies.run(() => clipboard.copyText(text)); if (close) access.closeForSender(e) })
  ipcMain.handle('clipboard:paste', (e, id: unknown, mode: unknown) => { access.assertWidget(e); return copies.run(() => access.paste(e, () => clipboard.copy(id, mode))) })
  ipcMain.handle('clipboard:pasteText', (e, text: unknown) => { access.assertWidget(e); return copies.run(() => access.paste(e, () => clipboard.copyText(text))) })
  ipcMain.handle('clipboard:update', (e, id: unknown, value: unknown) => { caller(e); clipboard.update(id, value) })
  ipcMain.handle('clipboard:remove', (e, ids: unknown) => { caller(e); clipboard.remove(ids) })
  ipcMain.handle('clipboard:clear', e => { caller(e); return settings.run(() => clipboard.clear()) })
  ipcMain.handle('clipboard:captureCurrent', e => { caller(e); return clipboard.captureCurrent() })
  ipcMain.handle('clipboard:ocr', (e, id: unknown) => { caller(e); return access.recognize(id, e) })
}
