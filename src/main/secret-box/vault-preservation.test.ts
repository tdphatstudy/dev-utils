import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { SCRYPT_PARAMS, VAULT_DIR } from '@shared/secret-box/constants'
import type { VaultConfig } from '@shared/secret-box/types'
const mocks = vi.hoisted(() => ({ userData: '', hardware: 'fixture-hardware', available: true }))
vi.mock('electron', () => ({ app: { getPath: () => mocks.userData, isReady: () => true }, safeStorage: {
  isEncryptionAvailable: () => mocks.available,
  encryptString: (value: string) => Buffer.from(`encrypted:${value}`),
  decryptString: (value: Buffer) => { if (!value.toString().startsWith('encrypted:')) throw new Error('fixture decryption failure'); return value.toString().slice(10) }
} }))
vi.mock('./machine-id', () => ({ resolveHardwareDeviceSecret: async () => { if (!mocks.hardware) throw new Error('Hardware unavailable'); return mocks.hardware } }))
import { ensureDefaultSecretBox, readVaultConfig, getStatus, readRegistry, accessVault } from './vault'
import { defaultSecretBoxPath, deviceSecretPath, hardwareSecretCachePath, secretBoxRegistryPath } from './paths'
import { resolveDeviceKeyAForSetup, listDeviceKeyCandidates } from './device-secret'
import { deriveLayerKeys, sealDoc, serializeEnvelope } from './crypto'
import { clearAccess, setAccess, getAccess } from './session'
import { removeEntry, renameEntry } from './fs-ops'
import { resolveVaultPath } from './vault-paths'

let root: string
const config = (): VaultConfig => ({ version: 1, mode: 'device', kdf: 'scrypt', kdfParams: { ...SCRYPT_PARAMS }, salt: Buffer.alloc(16, 7).toString('base64'), createdAt: '2026-10-04T00:00:00.000Z' })
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'devutils-vault-preserve-')); mocks.userData = join(root, 'userData'); mocks.hardware = 'fixture-hardware'; mocks.available = true; await mkdir(mocks.userData) })
afterEach(async () => { clearAccess(); await rm(root, { recursive: true, force: true }) })

it('hardware setup/cache preserves legacy recovery material and a legacy encrypted document still unlocks', async () => {
  const legacy = 'legacy-secret', password = ' password with spaces '
  const legacyBytes = Buffer.from(`encrypted:${legacy}`)
  await writeFile(deviceSecretPath(), legacyBytes)
  expect(await resolveDeviceKeyAForSetup()).toBe(mocks.hardware)
  expect(await readFile(deviceSecretPath())).toEqual(legacyBytes)
  const cached = await readFile(hardwareSecretCachePath())
  mocks.hardware = 'different-hardware'
  await resolveDeviceKeyAForSetup()
  expect(await readFile(hardwareSecretCachePath())).toEqual(cached)
  mocks.hardware = ''
  expect(await listDeviceKeyCandidates()).toEqual([{ source: 'legacy-file', keyA: legacy }, { source: 'hardware-cache', keyA: 'fixture-hardware' }])
  mocks.hardware = 'fixture-hardware'
  const vaultRoot = join(root, 'legacy-box'); await mkdir(join(vaultRoot, VAULT_DIR), { recursive: true })
  const cfg = config(), keys = deriveLayerKeys(legacy, password, Buffer.from(cfg.salt, 'base64'))
  await writeFile(join(vaultRoot, VAULT_DIR, 'vault.json'), JSON.stringify(cfg))
  const doc = { name: 'sample.txt', type: 'text' as const, encoding: 'utf-8' as const, createdAt: cfg.createdAt, updatedAt: cfg.createdAt, content: 'legacy data stays readable' }
  await writeFile(join(vaultRoot, 'sample.putl'), serializeEnvelope(sealDoc(keys.keyA, keys.keyB, 'device', doc)))
  await writeFile(secretBoxRegistryPath(), JSON.stringify({ version: 1, activeId: 'legacy', vaults: [{ id: 'legacy', name: 'Legacy', rootPath: vaultRoot, createdAt: cfg.createdAt }] }))
  await ensureDefaultSecretBox()
  expect(await readFile(deviceSecretPath())).toEqual(legacyBytes)
  await accessVault({ keyB: password })
  expect(getAccess()?.rootPath).toBe(vaultRoot)
}, 15_000)

it('corrupt default metadata stays untouched and status points to a validated backup', async () => {
  const boxRoot = defaultSecretBoxPath(), dir = join(boxRoot, VAULT_DIR)
  await mkdir(dir, { recursive: true })
  const path = join(dir, 'vault.json'), corrupt = '{"salt":'
  await writeFile(path, corrupt); await writeFile(`${path}.bak`, JSON.stringify(config()))
  await writeFile(join(boxRoot, 'old.putl'), 'existing encrypted bytes')
  await writeFile(secretBoxRegistryPath(), JSON.stringify({ version: 1, activeId: 'default', vaults: [{ id: 'default', name: 'Default', rootPath: boxRoot, createdAt: config().createdAt }] }))
  await expect(ensureDefaultSecretBox()).rejects.toMatchObject({ code: 'CORRUPT' })
  await expect(readVaultConfig(boxRoot)).rejects.toMatchObject({ code: 'CORRUPT' })
  expect(await readFile(path, 'utf8')).toBe(corrupt)
  expect(await readFile(join(boxRoot, 'old.putl'), 'utf8')).toBe('existing encrypted bytes')
  const status = await getStatus()
  expect(status.hasAccess).toBe(false)
  expect(status.vaults[0]).toMatchObject({ metadataError: expect.stringContaining('corrupt'), metadataBackupPath: `${path}.bak`, mode: 'device' })
})

it('refuses to create a new salt over missing metadata with existing documents or metadata remnants', async () => {
  const boxRoot = defaultSecretBoxPath(); await mkdir(boxRoot, { recursive: true })
  await writeFile(join(boxRoot, 'old.putl'), 'keep bytes')
  await expect(ensureDefaultSecretBox()).rejects.toMatchObject({ code: 'MISSING' })
  expect(await readVaultConfig(boxRoot)).toBeNull()
  expect(await readFile(join(boxRoot, 'old.putl'), 'utf8')).toBe('keep bytes')
})

it('does not replace a corrupt registry or silently discard invalid entries', async () => {
  for (const raw of ['{"vaults":', JSON.stringify({ version: 1, activeId: 'missing', vaults: [] })]) {
    await writeFile(secretBoxRegistryPath(), raw)
    await expect(readRegistry()).rejects.toThrow(/registry/i)
    await expect(ensureDefaultSecretBox()).rejects.toThrow(/registry/i)
    expect(await readFile(secretBoxRegistryPath(), 'utf8')).toBe(raw)
  }
})

it('refuses oversized registry and legacy key files without modifying recovery material', async () => {
  const registry = Buffer.alloc(1024 * 1024 + 1, 32)
  await writeFile(secretBoxRegistryPath(), registry)
  await expect(readRegistry()).rejects.toThrow('registry')
  expect((await readFile(secretBoxRegistryPath())).equals(registry)).toBe(true)
  const legacy = Buffer.alloc(64 * 1024 + 1, 7)
  await writeFile(deviceSecretPath(), legacy)
  mocks.hardware = ''
  await expect(listDeviceKeyCandidates()).rejects.toMatchObject({ name: 'DEVICE_SECRET_UNREADABLE' })
  expect((await readFile(deviceSecretPath())).equals(legacy)).toBe(true)
})

it('rejects root/metadata deletion and link escapes while allowing ordinary subfolders', async () => {
  const vaultRoot = join(root, 'box'), outside = join(root, 'outside')
  await mkdir(join(vaultRoot, VAULT_DIR), { recursive: true }); await mkdir(outside)
  await writeFile(join(vaultRoot, VAULT_DIR, 'vault.json'), JSON.stringify(config()))
  await writeFile(join(outside, 'keep.txt'), 'outside data')
  setAccess({ rootPath: vaultRoot, mode: 'device', config: config(), keyA: Buffer.alloc(32), keyB: Buffer.alloc(32) })
  for (const path of ['', '.', './', '/', VAULT_DIR, `${VAULT_DIR}/vault.json`, '.PRIVATEBOX/vault.json']) {
    await expect(removeEntry(path)).rejects.toThrow()
    await expect(renameEntry(path, 'new-name')).rejects.toThrow()
  }
  await symlink(outside, join(vaultRoot, 'escape'), process.platform === 'win32' ? 'junction' : 'dir')
  expect(() => resolveVaultPath('escape/keep.txt')).toThrow('escapes')
  await expect(removeEntry('escape')).rejects.toThrow('escapes')
  await symlink(join(vaultRoot, VAULT_DIR), join(vaultRoot, 'meta-alias'), process.platform === 'win32' ? 'junction' : 'dir')
  expect(() => resolveVaultPath('meta-alias/vault.json')).toThrow('protected')
  expect(await readFile(join(outside, 'keep.txt'), 'utf8')).toBe('outside data')
  await mkdir(join(vaultRoot, 'documents'))
  expect(resolveVaultPath('documents')).toBe(join(vaultRoot, 'documents'))
})
