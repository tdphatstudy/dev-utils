import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { join } from 'path'
import { tmpdir } from 'os'
import * as fs from 'node:fs/promises'
import { SCRYPT_PARAMS } from '@shared/secret-box/constants'
import type { VaultConfig, DocPayload } from '@shared/secret-box/types'
const hooks = vi.hoisted(() => ({ userData: '', read: undefined as undefined | ((path: string) => Promise<void>), write: undefined as undefined | ((path: string) => Promise<void>), dialog: undefined as undefined | (() => Promise<unknown>) }))
vi.mock('fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof import('fs/promises')>()
  return { ...real,
    readFile: async (...args: Parameters<typeof real.readFile>) => { const value = await real.readFile(...args); await hooks.read?.(String(args[0])); return value },
    writeFile: async (...args: Parameters<typeof real.writeFile>) => { await real.writeFile(...args); await hooks.write?.(String(args[0])) }
  }
})
vi.mock('electron', () => ({ app: { getPath: () => hooks.userData }, BrowserWindow: { fromWebContents: () => ({}) }, dialog: {
  showOpenDialog: () => hooks.dialog!(), showSaveDialog: () => hooks.dialog!()
} }))
import { readDoc, writeDoc, createFileWithContent, listDir } from './fs-ops'
import { exportDocToDisk, importPlainFromDisk, saveDocument } from './export-import'
import { accessVault, setupVault } from './vault'
import { getAccess, clearAccess, setAccess, type EphemeralAccess } from './session'
import { sealDoc, serializeEnvelope } from './crypto'

let root: string, first: EphemeralAccess, second: EphemeralAccess
function config(): VaultConfig { return { version: 1, mode: 'portable', kdf: 'scrypt', kdfParams: { ...SCRYPT_PARAMS }, salt: Buffer.alloc(16, 7).toString('base64'), createdAt: '2026-10-04T00:00:00.000Z' } }
function session(path: string, byte: number): EphemeralAccess { return { rootPath: path, mode: 'portable', config: config(), keyA: Buffer.alloc(32, byte), keyB: Buffer.alloc(32, byte + 1) } }
const payload: DocPayload = { name: 'secret.txt', type: 'text', encoding: 'utf-8', createdAt: '2026-10-04T00:00:00.000Z', updatedAt: '2026-10-04T00:00:00.000Z', content: 'first box secret' }
function barrier() {
  let entered!: () => void, release!: () => void
  const reached = new Promise<void>((resolve) => { entered = resolve })
  const paused = new Promise<void>((resolve) => { release = resolve })
  return { reached, release, wait: async () => { entered(); await paused } }
}
beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'devutils-session-race-'))
  hooks.userData = join(root, 'userData'); await fs.mkdir(hooks.userData)
  first = session(join(root, 'first'), 3); second = session(join(root, 'second'), 8)
  await fs.mkdir(first.rootPath); await fs.mkdir(second.rootPath)
  await fs.writeFile(join(first.rootPath, 'same.putl'), serializeEnvelope(sealDoc(first.keyA, first.keyB, first.mode, payload)))
  await fs.writeFile(join(second.rootPath, 'same.putl'), 'second box sentinel')
  await fs.writeFile(join(hooks.userData, 'privatebox-registry.json'), JSON.stringify({ version: 1, activeId: 'first', vaults: [{ id: 'first', name: 'First', rootPath: first.rootPath, createdAt: config().createdAt }] }))
  setAccess(first)
})
afterEach(async () => { hooks.read = undefined; hooks.write = undefined; hooks.dialog = undefined; clearAccess(); await fs.rm(root, { recursive: true, force: true }) })

it('rejects a paused read/list/write after switching boxes without returning plaintext or corrupting either file', async () => {
  for (const operation of [() => readDoc('same.putl'), () => listDir(''), () => writeDoc('same.putl', 'must not cross boxes')]) {
    first = session(first.rootPath, 3); second = session(second.rootPath, 8); setAccess(first)
    const original = await fs.readFile(join(first.rootPath, 'same.putl'))
    const paused = barrier(); hooks.read = async (path) => { if (path === join(first.rootPath, 'same.putl')) await paused.wait() }
    const result = operation().then((value) => ({ value }), (error: Error) => ({ error }))
    await paused.reached; setAccess(second); paused.release()
    expect(await result).toMatchObject({ error: { name: 'SESSION_CHANGED' } })
    hooks.read = undefined
    expect(await fs.readFile(join(first.rootPath, 'same.putl'))).toEqual(original)
    expect(await fs.readFile(join(second.rootPath, 'same.putl'), 'utf8')).toBe('second box sentinel')
  }
})

it('drops a staged create after sign out, removes its temp file and never publishes a document', async () => {
  const paused = barrier()
  hooks.write = async (path) => { if (path.endsWith('.tmp') && path.includes(first.rootPath)) await paused.wait() }
  const result = createFileWithContent('', 'new.txt', 'text', 'unsaved secret').then((value) => ({ value }), (error: Error) => ({ error }))
  await paused.reached; clearAccess(); paused.release()
  expect(await result).toMatchObject({ error: { name: 'SESSION_CHANGED' } })
  expect(await fs.readdir(first.rootPath)).toEqual(['same.putl'])
  expect(await fs.readdir(second.rootPath)).toEqual(['same.putl'])
})

it('cancels import/export after a dialog waits across a box switch, preserving destination bytes', async () => {
  const destination = join(root, 'export.txt'); await fs.writeFile(destination, 'destination sentinel')
  for (const exporting of [true, false]) {
    first = session(first.rootPath, 3); second = session(second.rootPath, 8); setAccess(first)
    const paused = barrier()
    hooks.dialog = async () => { await paused.wait(); return exporting ? { canceled: false, filePath: destination } : { canceled: false, filePaths: [destination] } }
    const result = (exporting ? exportDocToDisk('same.putl', {} as Electron.WebContents) : importPlainFromDisk({} as Electron.WebContents)).then((value) => ({ value }), (error: Error) => ({ error }))
    await paused.reached; setAccess(second); paused.release()
    expect(await result).toMatchObject({ error: { name: 'SESSION_CHANGED' } })
    expect(await fs.readFile(destination, 'utf8')).toBe('destination sentinel')
    expect(await fs.readdir(second.rootPath)).toEqual(['same.putl'])
  }
})

it('does not reopen an in-flight unlock or save after sign out during registry IO', async () => {
  for (const operation of [() => accessVault({ keyA: 'fixture key', keyB: 'fixture password' }), () => saveDocument({ name: 'new.txt', type: 'text', content: 'secret' })]) {
    first = session(first.rootPath, 3); setAccess(first)
    const paused = barrier(); hooks.read = async (path) => { if (path.endsWith('privatebox-registry.json')) await paused.wait() }
    const result = operation().then((value) => ({ value }), (error: Error) => ({ error }))
    await paused.reached; clearAccess(); paused.release()
    expect(await result).toMatchObject({ error: { name: 'SESSION_CHANGED' } })
    expect(getAccess()).toBeNull()
    expect(await fs.readdir(first.rootPath)).toEqual(['same.putl'])
    hooks.read = undefined
  }
})

it('pins a prepared save to its intended box even if a new IPC starts after a different box is active', async () => {
  await expect(saveDocument({ boxId: 'other-box', name: 'new.txt', type: 'text', content: 'must not save here' })).rejects.toThrow('SESSION_CHANGED')
  expect(await fs.readdir(first.rootPath)).toEqual(['same.putl'])
  const saved = await saveDocument({ boxId: 'first', name: 'new.txt', type: 'text', content: 'correct box content' })
  expect(saved.boxId).toBe('first')
  expect((await readDoc(saved.doc.relativePath)).content).toBe('correct box content')
})

it('does not publish setup metadata or start access after sign out during its staged write', async () => {
  const newRoot = join(root, 'new'); await fs.mkdir(newRoot)
  const paused = barrier()
  hooks.write = async (path) => { if (path.includes(newRoot) && path.endsWith('.tmp')) await paused.wait() }
  const result = setupVault({ rootPath: newRoot, mode: 'portable', keyA: 'fixture A', keyB: 'fixture B' }).then((value) => ({ value }), (error: Error) => ({ error }))
  await paused.reached; clearAccess(); paused.release()
  expect(await result).toMatchObject({ error: { name: 'SESSION_CHANGED' } })
  expect(getAccess()).toBeNull()
  await expect(fs.stat(join(newRoot, '.privatebox', 'vault.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await fs.readdir(join(newRoot, '.privatebox'))).toEqual([])
}, 15_000)
