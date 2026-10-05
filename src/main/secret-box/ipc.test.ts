import { afterEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ handle: vi.fn(), trust: vi.fn(), service: vi.fn() }))
vi.mock('electron', () => ({ ipcMain: { handle: mocks.handle }, dialog: {}, BrowserWindow: {} }))
vi.mock('../ipc-trust', () => ({ assertTrustedIpc: mocks.trust }))
vi.mock('./vault', () => Object.fromEntries(['accessVault', 'recoverVaultMetadata', 'clearVaultAccess', 'ensureDefaultSecretBox', 'getStatus', 'isDirectoryEmpty', 'openExistingVaultPath', 'removeVaultFromList', 'renameVault', 'setActiveVault', 'setupVault'].map((name) => [name, mocks.service])))
vi.mock('./fs-ops', () => Object.fromEntries(['listDir', 'listFoldersRecursive', 'mkdirPath', 'createFile', 'readDoc', 'writeDoc', 'renameEntry', 'removeEntry'].map((name) => [name, mocks.service])))
vi.mock('./export-import', () => Object.fromEntries(['exportDocPlain', 'exportDocToDisk', 'importPlainToActiveBox', 'importPlainFromDisk', 'saveDocument', 'prepareDefaultBoxForSave', 'accessDefaultBox'].map((name) => [name, mocks.service])))
import { registerSecretBoxIpc } from './ipc'
afterEach(() => vi.resetAllMocks())
function handlers(): Map<string, (event: unknown, payload?: unknown) => Promise<unknown>> {
  registerSecretBoxIpc()
  return new Map(mocks.handle.mock.calls.map(([name, handler]) => [name, handler]))
}
it('keeps registered portable boxes visible when the default device box cannot initialize', async () => {
  const status = { configured: true, hasAccess: false, activeId: 'portable', mode: 'portable', vaults: [{ id: 'portable' }] }
  mocks.service.mockRejectedValueOnce(new Error('Hardware key unavailable')).mockResolvedValueOnce(status)
  await expect(handlers().get('privateBox:getStatus')!({})).resolves.toEqual({ ...status, initializationError: 'Hardware key unavailable' })
})
it('rejects untrusted callers before all box services or native dialogs', async () => {
  mocks.trust.mockImplementation(() => { throw new Error('Untrusted') })
  const registered = handlers()
  expect(registered.size).toBeGreaterThan(20)
  for (const handler of registered.values()) await expect(handler({}, {})).rejects.toThrow('Untrusted')
  expect(mocks.service).not.toHaveBeenCalled()
})
it('rejects malformed mutations and keeps exact password/content characters for valid calls', async () => {
  const registered = handlers()
  for (const [name, payload] of [
    ['privateBox:remove', null], ['privateBox:rename', { relativePath: 'file', newName: 42 }],
    ['privateBox:recoverMetadata', { boxId: 42, keyB: 'fixture' }],
    ['privateBox:setup', { rootPath: 'root', keyA: '', keyB: 'pwd', mode: 'invalid' }],
    ['privateBox:createFile', { relativeDir: '', name: 'file', type: 'unknown' }],
    ['privateBox:importPlain', { name: 'media', content: '', encoding: 'invalid' }],
    ['privateBox:writeFile', { relativePath: 'file\0bad', content: 'text' }]
  ] as const) await expect(registered.get(name)!({}, payload)).rejects.toThrow('Invalid')
  expect(mocks.service).not.toHaveBeenCalled()
  const password = ' password\nwith whitespace '
  await registered.get('privateBox:access')!({}, { keyB: password })
  expect(mocks.service).toHaveBeenLastCalledWith({ keyB: password })
  await registered.get('privateBox:writeFile')!({}, { relativePath: 'sample.putl', content: ' a\n\0b ' })
  expect(mocks.service).toHaveBeenLastCalledWith('sample.putl', ' a\n\0b ')
})
