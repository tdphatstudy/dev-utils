import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
const mocks = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => any>(), hash: vi.fn(), trusted: vi.fn() }))
vi.mock('electron', () => ({ ipcMain: { handle: (name: string, handler: (...args: any[]) => any) => mocks.handlers.set(name, handler) } }))
vi.mock('./ipc-trust', () => ({ assertTrustedIpc: mocks.trusted }))
vi.mock('./file-hash', () => ({ hashFile: mocks.hash }))
import { registerFileHashIpc } from './file-hash-ipc'

function sender(id: number): EventEmitter & { id: number; send: ReturnType<typeof vi.fn>; isDestroyed: () => boolean } {
  return Object.assign(new EventEmitter(), { id, send: vi.fn(), isDestroyed: () => false })
}
beforeEach(() => {
  mocks.handlers.clear()
  mocks.hash.mockReset()
  mocks.trusted.mockReset()
  registerFileHashIpc()
})
describe('file hash job lifecycle', () => {
  it('scopes cancel to the sender and request, rejects overlap, and removes completed jobs', async () => {
    const owner = sender(1)
    const other = sender(2)
    mocks.hash.mockImplementation((_payload, { signal, onProgress }) => {
      onProgress(65536, 100000)
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }))
    })
    const hash = mocks.handlers.get('file:hash')!
    const cancel = mocks.handlers.get('file:cancelHash')!
    const operation = hash({ sender: owner }, { requestId: 'job-1' })
    const rejected = expect(operation).rejects.toThrow('canceled')
    expect(owner.send).toHaveBeenCalledWith('file:hashProgress', { requestId: 'job-1', bytesRead: 65536, totalBytes: 100000 })
    await expect(hash({ sender: owner }, { requestId: 'job-2' })).rejects.toThrow('already being hashed')
    expect(cancel({ sender: other }, 'job-1')).toBe(false)
    expect(cancel({ sender: owner }, 'wrong-id')).toBe(false)
    expect(cancel({ sender: owner }, 'job-1')).toBe(true)
    await rejected
    expect(owner.listenerCount('destroyed')).toBe(0)
    mocks.hash.mockResolvedValue('checksum')
    await expect(hash({ sender: owner }, { requestId: 'job-2' })).resolves.toBe('checksum')
    expect(cancel({ sender: owner }, 'job-2')).toBe(false)
  })
  it('cancels when the owning window is destroyed', async () => {
    const owner = sender(1)
    mocks.hash.mockImplementation((_payload, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    }))
    const operation = mocks.handlers.get('file:hash')!({ sender: owner }, { requestId: 'job-1' })
    const rejected = expect(operation).rejects.toThrow('canceled')
    owner.emit('destroyed')
    await rejected
    expect(owner.listenerCount('destroyed')).toBe(0)
  })
  it('checks trust and validates IDs before starting work', async () => {
    const event = { sender: sender(1) }
    const hash = mocks.handlers.get('file:hash')!
    await expect(hash(event, null)).rejects.toThrow('request ID')
    mocks.trusted.mockImplementation(() => { throw new Error('untrusted') })
    await expect(hash(event, { requestId: 'valid' })).rejects.toThrow('untrusted')
    expect(mocks.hash).not.toHaveBeenCalled()
  })
})
