import { afterEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ handle: vi.fn(), trust: vi.fn(), list: vi.fn(), kill: vi.fn() }))
vi.mock('electron', () => ({ ipcMain: { handle: mocks.handle } }))
vi.mock('./ipc-trust', () => ({ assertTrustedIpc: mocks.trust }))
vi.mock('./ports', () => ({ listListeningPorts: mocks.list, killProcessOnPort: mocks.kill }))
import { registerPortsIpc } from './ports-ipc'
afterEach(() => vi.resetAllMocks())
function handler(channel: string): (...args: unknown[]) => Promise<unknown> {
  registerPortsIpc()
  return mocks.handle.mock.calls.find(([name]) => name === channel)![1]
}
it('rejects untrusted requests before scanning or stopping', async () => {
  mocks.trust.mockImplementation(() => { throw new Error('Untrusted') })
  await expect(handler('ports:list')({})).rejects.toThrow('Untrusted')
  await expect(handler('ports:kill')({}, { port: 3000, pid: 123 })).rejects.toThrow('Untrusted')
  expect(mocks.list).not.toHaveBeenCalled()
  expect(mocks.kill).not.toHaveBeenCalled()
})
it('rejects malformed confirmation payloads at the IPC boundary', async () => {
  const stop = handler('ports:kill')
  for (const payload of [null, undefined, { confirmPhrase: 1 }, { confirmPhrase: 'x'.repeat(65) }]) {
    await expect(stop({}, payload)).rejects.toThrow('Invalid')
  }
  expect(mocks.kill).not.toHaveBeenCalled()
})
it('dispatches explicit port/PID only after checking sender trust', async () => {
  await handler('ports:kill')({}, { port: 5432, pid: 123, confirmPhrase: 'kill 5432' })
  expect(mocks.trust).toHaveBeenCalledExactlyOnceWith({})
  expect(mocks.kill).toHaveBeenCalledExactlyOnceWith(5432, 123, { confirmPhrase: 'kill 5432' })
})
