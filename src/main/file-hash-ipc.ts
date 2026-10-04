import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { hashFile } from './file-hash'
import { assertTrustedIpc } from './ipc-trust'

export function registerFileHashIpc(): void {
  const jobs = new Map<number, { id: string; abort: AbortController }>()
  ipcMain.handle('file:hash', async (event: IpcMainInvokeEvent, payload: unknown) => {
    assertTrustedIpc(event)
    const ownerId = event.sender.id
    const id = (payload as { requestId?: unknown } | null)?.requestId
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error('Invalid file hash request ID.')
    if (jobs.has(ownerId)) throw new Error('A file is already being hashed. Cancel it or wait for completion.')
    const abort = new AbortController()
    const job = { id, abort }
    jobs.set(ownerId, job)
    const destroyed = (): void => abort.abort()
    event.sender.once('destroyed', destroyed)
    try {
      return await hashFile(payload, {
        signal: abort.signal,
        onProgress: (bytesRead, totalBytes) => {
          if (!event.sender.isDestroyed()) event.sender.send('file:hashProgress', { requestId: id, bytesRead, totalBytes })
        }
      })
    } catch (error) {
      if (abort.signal.aborted) throw new Error('File hashing canceled.')
      throw error
    } finally {
      event.sender.removeListener('destroyed', destroyed)
      if (jobs.get(ownerId) === job) jobs.delete(ownerId)
    }
  })
  ipcMain.handle('file:cancelHash', (event: IpcMainInvokeEvent, id: unknown) => {
    assertTrustedIpc(event)
    if (typeof id !== 'string' || id.length > 80) throw new Error('Invalid file hash request ID.')
    const job = jobs.get(event.sender.id)
    if (!job || job.id !== id) return false
    job.abort.abort()
    return true
  })
}
