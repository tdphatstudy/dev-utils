import { ipcMain } from 'electron'
import { assertTrustedIpc } from './ipc-trust'
import { performHttpRequest } from './http-request'
import type { HttpRequestPayload } from '@shared/http/types'

export function registerHttpIpc(): void {
  const jobs = new Map<number, { id: string; abort: AbortController }>()
  ipcMain.handle('net:httpRequest', async (event, payload: HttpRequestPayload, id: unknown) => {
    assertTrustedIpc(event)
    const ownerId = event.sender.id
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error('Invalid HTTP request ID.')
    if (jobs.has(ownerId)) throw new Error('An HTTP request is already running. Cancel it or wait.')
    const job = { id, abort: new AbortController() }
    jobs.set(ownerId, job)
    const destroyed = (): void => job.abort.abort()
    event.sender.once('destroyed', destroyed)
    try { return await performHttpRequest(payload, job.abort.signal) }
    finally {
      event.sender.removeListener('destroyed', destroyed)
      if (jobs.get(ownerId) === job) jobs.delete(ownerId)
    }
  })
  ipcMain.handle('net:cancelHttpRequest', (event, id: unknown) => {
    assertTrustedIpc(event)
    if (typeof id !== 'string' || id.length > 80) throw new Error('Invalid HTTP request ID.')
    const job = jobs.get(event.sender.id)
    if (!job || job.id !== id) return false
    job.abort.abort()
    return true
  })
}
