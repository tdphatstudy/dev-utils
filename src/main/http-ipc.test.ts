import { beforeEach, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
const mocks = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => any>(), request: vi.fn(), trusted: vi.fn() }))
vi.mock('electron', () => ({ ipcMain: { handle: (name: string, handler: (...args: any[]) => any) => mocks.handlers.set(name, handler) } }))
vi.mock('./ipc-trust', () => ({ assertTrustedIpc: mocks.trusted }))
vi.mock('./http-request', () => ({ performHttpRequest: mocks.request }))
import { registerHttpIpc } from './http-ipc'
beforeEach(() => {
  mocks.handlers.clear(); mocks.request.mockReset(); mocks.trusted.mockReset()
  registerHttpIpc()
})
it('scopes cancellation to the owner/request and releases completed jobs', async () => {
  const owner = Object.assign(new EventEmitter(), { id: 1 })
  const other = Object.assign(new EventEmitter(), { id: 2 })
  mocks.request.mockImplementation((_payload, signal) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('canceled')), { once: true })
  }))
  const send = mocks.handlers.get('net:httpRequest')!
  const cancel = mocks.handlers.get('net:cancelHttpRequest')!
  const pending = send({ sender: owner }, {}, 'job-1')
  const rejected = expect(pending).rejects.toThrow('canceled')
  await expect(send({ sender: owner }, {}, 'job-2')).rejects.toThrow('already running')
  expect(cancel({ sender: other }, 'job-1')).toBe(false)
  expect(cancel({ sender: owner }, 'wrong')).toBe(false)
  expect(cancel({ sender: owner }, 'job-1')).toBe(true)
  await rejected
  expect(owner.listenerCount('destroyed')).toBe(0)
  mocks.request.mockResolvedValue({ status: 204 })
  await expect(send({ sender: owner }, {}, 'job-2')).resolves.toEqual({ status: 204 })
  expect(cancel({ sender: owner }, 'job-2')).toBe(false)
})
it('aborts when the owner window closes', async () => {
  const owner = Object.assign(new EventEmitter(), { id: 1 })
  mocks.request.mockImplementation((_payload, signal) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('canceled')), { once: true })
  }))
  const pending = mocks.handlers.get('net:httpRequest')!({ sender: owner }, {}, 'job-1')
  const rejected = expect(pending).rejects.toThrow('canceled')
  owner.emit('destroyed')
  await rejected
  expect(owner.listenerCount('destroyed')).toBe(0)
})
it('checks trust and validates job IDs before sending', async () => {
  const event = { sender: Object.assign(new EventEmitter(), { id: 1 }) }
  const send = mocks.handlers.get('net:httpRequest')!
  await expect(send(event, {}, undefined)).rejects.toThrow('request ID')
  mocks.trusted.mockImplementation(() => { throw new Error('untrusted') })
  await expect(send(event, {}, 'valid')).rejects.toThrow('untrusted')
  expect(mocks.request).not.toHaveBeenCalled()
})
