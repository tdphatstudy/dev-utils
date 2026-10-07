import { EventEmitter } from 'node:events'
import type { BrowserWindow } from 'electron'
import { expect, it, vi } from 'vitest'
import { attachWindowRecovery } from './window-recovery'
function fixture(): BrowserWindow {
  return { isDestroyed: () => false, close: vi.fn(), webContents: Object.assign(new EventEmitter(), { reload: vi.fn() }) } as unknown as BrowserWindow
}
it('invalidates state before one prompt, ignores clean exits and reloads only after user choice', async () => {
  const win = fixture(), invalidate = vi.fn()
  let answer!: (reload: boolean) => void
  const confirm = vi.fn(() => { expect(invalidate).toHaveBeenCalledOnce(); return new Promise<boolean>(resolve => { answer = resolve }) })
  attachWindowRecovery(win, invalidate, confirm)
  win.webContents.emit('render-process-gone', {}, { reason: 'clean-exit' })
  expect(invalidate).not.toHaveBeenCalled()
  win.webContents.emit('render-process-gone', {}, { reason: 'crashed' })
  win.webContents.emit('render-process-gone', {}, { reason: 'oom' })
  await vi.waitFor(() => expect(confirm).toHaveBeenCalledOnce())
  expect(win.webContents.reload).not.toHaveBeenCalled()
  answer(true)
  await vi.waitFor(() => expect(win.webContents.reload).toHaveBeenCalledOnce())
})
it('closes on refusal and ignores answers for destroyed windows', async () => {
  const win = fixture()
  const recover = attachWindowRecovery(win, vi.fn(), async () => false)
  recover()
  await vi.waitFor(() => expect(win.close).toHaveBeenCalledOnce())
  const closed = fixture(), confirm = vi.fn().mockResolvedValue(true)
  attachWindowRecovery(closed, vi.fn(), confirm)()
  closed.webContents.emit('destroyed')
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(closed.webContents.reload).not.toHaveBeenCalled()
})
it('contains rejected native dialogs and synchronous reload failures', async () => {
  const win = fixture()
  attachWindowRecovery(win, vi.fn(), async () => { throw new Error('OS shutdown') })()
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(win.webContents.reload).not.toHaveBeenCalled()
  vi.mocked(win.webContents.reload).mockImplementation(() => { throw new Error('closed') })
  attachWindowRecovery(win, vi.fn(), async () => true)()
  await vi.waitFor(() => expect(win.webContents.reload).toHaveBeenCalledOnce())
})
