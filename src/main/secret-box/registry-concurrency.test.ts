import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { join } from 'path'
import { tmpdir } from 'os'
import * as fs from 'node:fs/promises'
import { SCRYPT_PARAMS } from '@shared/secret-box/constants'
const hooks = vi.hoisted(() => ({ userData: '', write: undefined as undefined | ((path: string) => Promise<void>) }))
vi.mock('electron', () => ({ app: { getPath: () => hooks.userData, isReady: () => true }, safeStorage: { isEncryptionAvailable: () => false } }))
vi.mock('./machine-id', () => ({ resolveHardwareDeviceSecret: async () => 'fixture-hardware' }))
vi.mock('fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof import('fs/promises')>()
  return { ...real, writeFile: async (...args: Parameters<typeof real.writeFile>) => { await real.writeFile(...args); await hooks.write?.(String(args[0])) } }
})
import { readRegistry, ensureDefaultSecretBox, renameVault, removeVaultFromList, setActiveVault, openExistingVaultPath } from './vault'
import { clearAccess } from './session'
import { defaultSecretBoxPath, secretBoxRegistryPath } from './paths'
import { writeRegistry } from './registry'

let root: string
const config = () => ({ version: 1, mode: 'portable', kdf: 'scrypt', kdfParams: { ...SCRYPT_PARAMS }, salt: Buffer.alloc(16, 7).toString('base64'), createdAt: '2026-10-04T00:00:00.000Z' })
async function makeBox(name: string): Promise<string> {
  const path = join(root, name); await fs.mkdir(join(path, '.privatebox'), { recursive: true })
  await fs.writeFile(join(path, '.privatebox', 'vault.json'), JSON.stringify(config()))
  return path
}
function barrier() {
  let entered!: () => void, release!: () => void
  const reached = new Promise<void>((resolve) => { entered = resolve })
  const paused = new Promise<void>((resolve) => { release = resolve })
  return { reached, release, wait: async () => { entered(); await paused } }
}
beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'devutils-registry-queue-')); hooks.userData = join(root, 'userData'); await fs.mkdir(hooks.userData)
  const first = await makeBox('first'), second = await makeBox('second')
  await fs.writeFile(secretBoxRegistryPath(), JSON.stringify({ version: 1, activeId: 'first', vaults: [
    { id: 'first', name: 'First', rootPath: first, createdAt: config().createdAt },
    { id: 'second', name: 'Second', rootPath: second, createdAt: config().createdAt }
  ] }))
})
afterEach(async () => { hooks.write = undefined; clearAccess(); await fs.rm(root, { recursive: true, force: true }) })

it('serializes complete registry transactions so parallel rename/default updates do not lose entries or names', async () => {
  const paused = barrier(), original = await fs.readFile(secretBoxRegistryPath())
  let firstWrite = true
  hooks.write = async (path) => { if (firstWrite && path.includes('privatebox-registry.json') && path.endsWith('.tmp')) { firstWrite = false; await paused.wait() } }
  const renaming = renameVault('first', 'Renamed first')
  await paused.reached
  const remaining = Promise.all([renameVault('second', 'Renamed second'), ensureDefaultSecretBox()])
  expect(await fs.readFile(secretBoxRegistryPath())).toEqual(original)
  paused.release(); await renaming; await remaining
  const registry = await readRegistry()
  expect(registry.activeId).toBe('first')
  expect(registry.vaults.find((v) => v.id === 'first')?.name).toBe('Renamed first')
  expect(registry.vaults.find((v) => v.id === 'second')?.name).toBe('Renamed second')
  expect(registry.vaults.filter((v) => v.isDefault)).toHaveLength(1)
  expect(registry.vaults).toHaveLength(3)
})

it('preserves a new selected folder when rename and background default checks are queued beside it', async () => {
  const third = await makeBox('third'), bytes = await fs.readFile(join(third, '.privatebox', 'vault.json'))
  await Promise.all([openExistingVaultPath(third, 'Third'), renameVault('second', 'Second updated'), ensureDefaultSecretBox()])
  const registry = await readRegistry()
  const added = registry.vaults.find((v) => v.rootPath === third)!
  expect(registry.activeId).toBe(added.id)
  expect(added.name).toBe('Third')
  expect(registry.vaults.find((v) => v.id === 'second')?.name).toBe('Second updated')
  expect(registry.vaults).toHaveLength(4)
  expect(await fs.readFile(join(third, '.privatebox', 'vault.json'))).toEqual(bytes)
})

it('concurrent default creation produces one stable salt/id and latest selection cancels an older queued request', async () => {
  let registryWrites = 0
  hooks.write = async (path) => { if (path.includes('privatebox-registry.json') && path.endsWith('.tmp')) registryWrites++ }
  const defaults = await Promise.all([ensureDefaultSecretBox(), ensureDefaultSecretBox(), ensureDefaultSecretBox()])
  expect(new Set(defaults.map((entry) => entry.id)).size).toBe(1)
  expect(registryWrites).toBe(1)
  const bytes = await fs.readFile(join(defaultSecretBoxPath(), '.privatebox', 'vault.json'))
  const selected = await Promise.allSettled([setActiveVault('first'), setActiveVault('second')])
  expect(selected[0]).toMatchObject({ status: 'rejected', reason: { name: 'SESSION_CHANGED' } })
  expect(selected[1].status).toBe('fulfilled')
  await ensureDefaultSecretBox()
  expect(registryWrites).toBe(2)
  expect((await readRegistry()).activeId).toBe('second')
  expect(await fs.readFile(join(defaultSecretBoxPath(), '.privatebox', 'vault.json'))).toEqual(bytes)
})

it('a failed transaction releases the queue and removal never gets reintroduced by an old rename/default snapshot', async () => {
  const results = await Promise.allSettled([renameVault('unknown', 'Fail'), removeVaultFromList('second'), renameVault('first', 'Survives'), ensureDefaultSecretBox()])
  expect(results[0].status).toBe('rejected')
  expect(results.slice(1).every((result) => result.status === 'fulfilled')).toBe(true)
  const registry = await readRegistry()
  expect(registry.vaults.some((v) => v.id === 'second')).toBe(false)
  expect(registry.vaults.find((v) => v.id === 'first')?.name).toBe('Survives')
  await expect(removeVaultFromList('unknown')).rejects.toThrow('Vault not found')
})

it('refuses invalid or oversized registry writes before touching the prior registry', async () => {
  const current = await readRegistry(), original = await fs.readFile(secretBoxRegistryPath())
  const item = current.vaults[0]!
  const tooMany = { ...current, activeId: null, vaults: Array.from({ length: 1025 }, (_, index) => ({ ...item, id: String(index) })) }
  await expect(writeRegistry(tooMany)).rejects.toThrow('invalid or unsupported')
  const tooLarge = { ...current, activeId: null, vaults: Array.from({ length: 1024 }, (_, index) => ({ ...item, id: String(index), name: 'x'.repeat(4096) })) }
  await expect(writeRegistry(tooLarge)).rejects.toThrow('exceeds 1 MiB')
  expect((await fs.readFile(secretBoxRegistryPath())).equals(original)).toBe(true)
})
