import { expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => any>(), trust: vi.fn() }))
vi.mock('electron', () => ({ ipcMain: { handle: (name: string, handler: (...args: any[]) => any) => mocks.handlers.set(name, handler) } }))
vi.mock('../ipc-trust', () => ({ assertTrustedIpc: mocks.trust }))
import { registerSecurityTestingIpc } from './ipc'
import type { SecurityTestingService } from './service'
it('rejects untrusted senders before every service method including consent and Stop', () => {
  const service = Object.fromEntries(['accepted', 'accept', 'stress', 'headers', 'cors', 'stop'].map(name => [name, vi.fn()]))
  registerSecurityTestingIpc(service as unknown as SecurityTestingService)
  mocks.trust.mockImplementation(() => { throw new Error('untrusted') })
  expect(mocks.handlers.size).toBe(6)
  for (const handler of mocks.handlers.values()) expect(() => handler({ sender: { id: 1 } }, {}, 'job')).toThrow('untrusted')
  for (const method of Object.values(service)) expect(method).not.toHaveBeenCalled()
})
