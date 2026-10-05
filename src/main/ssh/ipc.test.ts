import { afterEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ handle: vi.fn(), trust: vi.fn(), service: vi.fn() }))
vi.mock('electron', () => ({ ipcMain: { handle: mocks.handle } }))
vi.mock('../ipc-trust', () => ({ assertTrustedIpc: mocks.trust }))
vi.mock('./index', () => Object.fromEntries(['createSshKey', 'deleteHost', 'deleteSshKey', 'listSshInventory', 'renameSshKey', 'sshOpenFolder', 'sshPickConfigFile', 'sshPickFolder', 'sshReadPublic', 'sshTestConnect', 'upsertHost'].map((name) => [name, mocks.service])))
vi.mock('./paths', () => ({ resolveSshPaths: mocks.service }))
vi.mock('../crypto-keys', () => ({ generateKeyPair: mocks.service }))
import { registerCryptoAndSshIpc } from './ipc'
afterEach(() => vi.resetAllMocks())
function handlers(): Map<string, (event: unknown, payload?: unknown) => Promise<unknown>> {
  registerCryptoAndSshIpc()
  return new Map(mocks.handle.mock.calls.map(([name, handler]) => [name, handler]))
}
it('guards every SSH and crypto entry point before accessing any service', async () => {
  mocks.trust.mockImplementation(() => { throw new Error('Untrusted') })
  const registered = handlers()
  expect(registered.size).toBe(13)
  for (const handler of registered.values()) await expect(handler({}, {})).rejects.toThrow('Untrusted')
  expect(mocks.service).not.toHaveBeenCalled()
})
it('rejects malformed paths, locations and key-generation payloads', async () => {
  const registered = handlers()
  for (const [channel, payload] of [
    ['ssh:list', { sshDir: 42 }], ['ssh:deleteHost', null], ['ssh:readPublic', { path: '\0bad.pub' }],
    ['ssh:createKey', { name: 'key', algorithm: 'unsupported' }],
    ['ssh:renameKey', { path: 'key', newName: 42 }]
  ] as const) await expect(registered.get(channel)!({}, payload)).rejects.toThrow('Invalid')
  expect(mocks.service).not.toHaveBeenCalled()
})
it('dispatches a valid host edit with its explicit custom location after trust validation', async () => {
  const request = { alias: 'box', user: 'deploy', location: { sshDir: 'custom' } }
  await handlers().get('ssh:upsertHost')!({}, request)
  expect(mocks.service).toHaveBeenCalledWith({ alias: 'box', user: 'deploy' }, { sshDir: 'custom' })
  expect(mocks.trust).toHaveBeenCalledExactlyOnceWith({})
})
