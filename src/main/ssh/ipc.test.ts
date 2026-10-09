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

it('shares the key-generation budget between SSH creation and the standalone key generator', async () => {
  let release!: () => void
  mocks.service.mockImplementation(() => new Promise<void>(resolve => { release = resolve }))
  const registered = handlers()
  const first = registered.get('crypto:generateKeyPair')!({}, { algorithm: 'rsa', modulusLength: 4096 })
  await expect(registered.get('ssh:createKey')!({}, { name: 'fixture', algorithm: 'rsa' })).rejects.toThrow('already running')
  expect(mocks.service).toHaveBeenCalledTimes(1)
  release(); await first
  mocks.service.mockResolvedValue(undefined)
  await registered.get('ssh:createKey')!({}, { name: 'fixture', algorithm: 'ed25519' })
  expect(mocks.service).toHaveBeenCalledTimes(2)
})

it('bounds simultaneous SSH jobs without retaining a queue of connection requests', async () => {
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  mocks.service.mockImplementation(() => pending)
  const registered = handlers(), payload = { host: '127.0.0.1', port: 22 }
  const active = Array.from({ length: 4 }, () => registered.get('ssh:testConnect')!({}, payload))
  await expect(registered.get('ssh:testConnect')!({}, payload)).rejects.toThrow('Too many SSH')
  expect(mocks.service).toHaveBeenCalledTimes(4)
  release(); await Promise.all(active)
})
