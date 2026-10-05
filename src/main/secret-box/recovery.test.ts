import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { join } from 'path'
import { tmpdir } from 'os'
import * as fs from 'node:fs/promises'
import { SCRYPT_PARAMS } from '@shared/secret-box/constants'
import type { VaultConfig, DocPayload } from '@shared/secret-box/types'
const hooks = vi.hoisted(() => ({ userData: '', write: undefined as undefined | ((path: string) => Promise<void>) }))
vi.mock('electron', () => ({ app: { getPath: () => hooks.userData, isReady: () => true }, safeStorage: { isEncryptionAvailable: () => false } }))
vi.mock('./machine-id', () => ({ resolveHardwareDeviceSecret: async () => 'fixture hardware' }))
vi.mock('fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof import('fs/promises')>()
  return { ...real, writeFile: async (...args: Parameters<typeof real.writeFile>) => { await real.writeFile(...args); await hooks.write?.(String(args[0])) } }
})
import { recoverVaultMetadata, readVaultConfig, openExistingVaultPath, getStatus } from './vault'
import { deriveLayerKeys, createKeyVerifiers, sealDoc, serializeEnvelope } from './crypto'
import { getAccess, clearAccess } from './session'
import { readDoc } from './fs-ops'

let root: string, box: string, path: string, cfg: VaultConfig, backup: Buffer
const keyA = 'fixture A', keyB = ' original password '
const broken = Buffer.from('{"original": "truncated')
beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'devutils-recovery-')); hooks.userData = join(root, 'userData'); await fs.mkdir(hooks.userData)
  box = join(root, 'box'); await fs.mkdir(join(box, '.privatebox'), { recursive: true })
  path = join(box, '.privatebox', 'vault.json')
  cfg = { version: 1, mode: 'portable', kdf: 'scrypt', kdfParams: { ...SCRYPT_PARAMS }, salt: Buffer.alloc(16, 9).toString('base64'), createdAt: '2026-10-04T00:00:00.000Z' }
  backup = Buffer.from(`${JSON.stringify(cfg, null, 2)}\r\n`)
  await fs.writeFile(path, broken); await fs.writeFile(`${path}.bak`, backup)
  await fs.writeFile(join(hooks.userData, 'privatebox-registry.json'), JSON.stringify({ version: 1, activeId: 'box', vaults: [{ id: 'box', name: 'Box', rootPath: box, createdAt: cfg.createdAt }] }))
})
afterEach(async () => { hooks.write = undefined; clearAccess(); await fs.rm(root, { recursive: true, force: true }) })
async function document(name: string, password = keyB): Promise<void> {
  const keys = deriveLayerKeys(keyA, password, Buffer.from(cfg.salt, 'base64'))
  const payload: DocPayload = { name: 'sample.txt', type: 'text', encoding: 'utf-8', createdAt: cfg.createdAt, updatedAt: cfg.createdAt, content: 'original secret content' }
  await fs.writeFile(join(box, name), serializeEnvelope(sealDoc(keys.keyA, keys.keyB, 'portable', payload)))
  keys.keyA.fill(0); keys.keyB.fill(0)
}
const input = () => ({ boxId: 'box', keyA, keyB })

it('restores exact backup bytes, preserves corrupt metadata and decrypts with the recovered session', async () => {
  await document('sample.putl')
  const documentBytes = await fs.readFile(join(box, 'sample.putl'))
  const result = await recoverVaultMetadata(input())
  expect(result.checkedDocuments).toBe(1)
  expect(await fs.readFile(path)).toEqual(backup)
  expect(await fs.readFile(result.preservedMetadataPath!)).toEqual(broken)
  expect(await fs.readFile(`${path}.bak`)).toEqual(backup)
  expect(await fs.readFile(join(box, 'sample.putl'))).toEqual(documentBytes)
  expect((await readDoc('sample.putl')).content).toBe('original secret content')
  expect(getAccess()?.rootPath).toBe(box)
})

it('checks every encrypted file including hidden folders, refusing a mismatch after the first five', async () => {
  for (let index = 0; index < 5; index++) await document(`sample${index}.putl`)
  await fs.mkdir(join(box, '.hidden'))
  const keys = deriveLayerKeys(keyA, 'another password', Buffer.from(cfg.salt, 'base64'))
  const payload: DocPayload = { name: 'other.txt', type: 'text', encoding: 'utf-8', createdAt: cfg.createdAt, updatedAt: cfg.createdAt, content: 'different key' }
  await fs.writeFile(join(box, '.hidden', 'sixth.putl'), serializeEnvelope(sealDoc(keys.keyA, keys.keyB, 'portable', payload)))
  await expect(recoverVaultMetadata(input())).rejects.toThrow('Metadata was not changed')
  expect(await fs.readFile(path)).toEqual(broken)
  expect(await fs.readFile(`${path}.bak`)).toEqual(backup)
  expect(getAccess()).toBeNull()
})

it('does not skip encrypted remnants inside the metadata directory', async () => {
  await document('sample.putl')
  await fs.writeFile(join(box, '.privatebox', 'legacy-remnant.putl'), 'corrupt encrypted remnant')
  await expect(recoverVaultMetadata(input())).rejects.toThrow('Metadata was not changed')
  expect(await fs.readFile(path)).toEqual(broken)
})

it('refuses wrong keys, a healthy current config and an empty legacy backup with no proof', async () => {
  await expect(recoverVaultMetadata(input())).rejects.toThrow('no key verifier')
  await document('sample.putl')
  await expect(recoverVaultMetadata({ ...input(), keyB: keyB.trim() })).rejects.toThrow('Wrong keys')
  expect(await fs.readFile(path)).toEqual(broken)
  await fs.writeFile(path, backup)
  await expect(recoverVaultMetadata(input())).rejects.toThrow('Current metadata is readable')
  expect(await fs.readFile(path)).toEqual(backup)
})

it('recovers missing metadata in an authenticated empty vault after verifier proof', async () => {
  const keys = deriveLayerKeys(keyA, keyB, Buffer.from(cfg.salt, 'base64'))
  cfg.auth = createKeyVerifiers(keys.keyA, keys.keyB)
  await fs.writeFile(`${path}.bak`, JSON.stringify(cfg)); await fs.unlink(path)
  const result = await recoverVaultMetadata(input())
  expect(result.checkedDocuments).toBe(0)
  expect(result.preservedMetadataPath).toBeUndefined()
  expect(await readVaultConfig(box)).toEqual(cfg)
  expect(getAccess()?.config.auth).toEqual(cfg.auth)
}, 15_000)

it('sign out before metadata publication cancels recovery and retains the original plus preservation copy', async () => {
  await document('sample.putl')
  let entered!: () => void, release!: () => void
  const reached = new Promise<void>((resolve) => { entered = resolve }), pause = new Promise<void>((resolve) => { release = resolve })
  hooks.write = async (file) => { if (file.includes('vault.json') && file.endsWith('.tmp')) { entered(); await pause } }
  const recovering = recoverVaultMetadata(input()).then((value) => ({ value }), (error: Error) => ({ error }))
  await reached; clearAccess(); release()
  expect(await recovering).toMatchObject({ error: { name: 'SESSION_CHANGED' } })
  expect(await fs.readFile(path)).toEqual(broken)
  expect(await fs.readFile(`${path}.bak`)).toEqual(backup)
  const preserved = (await fs.readdir(join(box, '.privatebox'))).find((file) => file.includes('before-recovery'))!
  expect(await fs.readFile(join(box, '.privatebox', preserved))).toEqual(broken)
  expect(getAccess()).toBeNull()
})

it('adding a damaged folder with a valid backup exposes recovery without replacing metadata', async () => {
  await openExistingVaultPath(box)
  const status = await getStatus()
  expect(status.vaults[0]).toMatchObject({ metadataError: expect.stringContaining('corrupt'), metadataBackupPath: `${path}.bak`, mode: 'portable' })
  expect(await fs.readFile(path)).toEqual(broken)
})

it('refuses to publish if the backup changes after verification', async () => {
  await document('sample.putl')
  const changed = Buffer.from(JSON.stringify({ ...cfg, salt: Buffer.alloc(16, 1).toString('base64') }))
  hooks.write = async (file) => { if (file.includes('vault.json') && file.endsWith('.tmp')) await fs.writeFile(`${path}.bak`, changed) }
  await expect(recoverVaultMetadata(input())).rejects.toThrow('metadata changed')
  expect(await fs.readFile(path)).toEqual(broken)
  expect(await fs.readFile(`${path}.bak`)).toEqual(changed)
  expect(getAccess()).toBeNull()
})

it('refuses an oversized encrypted file before allocating its content instead of silently skipping it', async () => {
  const file = await fs.open(join(box, 'too-large.putl'), 'w')
  await file.truncate(97 * 1024 * 1024); await file.close()
  await expect(recoverVaultMetadata(input())).rejects.toThrow('up to 96 MiB')
  expect(await fs.readFile(path)).toEqual(broken)
  expect(await fs.readFile(`${path}.bak`)).toEqual(backup)
})
