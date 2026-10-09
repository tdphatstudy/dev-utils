import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as fs from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { SCRYPT_PARAMS } from '@shared/secret-box/constants'

const fixture = vi.hoisted(() => ({ root: '', fail: false, burst: false, closed: false }))
vi.mock('electron', () => ({ app: { getPath: () => fixture.root }, safeStorage: {} }))
vi.mock('fs/promises', async importOriginal => {
  const original = await importOriginal<typeof import('fs/promises')>()
  return { ...original, opendir: async (...args: Parameters<typeof original.opendir>) => {
    if (fixture.fail) throw Object.assign(new Error('Fixture unreadable directory'), { code: 'EACCES' })
    if (fixture.burst) return (async function* () {
      try {
        for (let i = 0; i < 30_000; i++) yield { name: `${i}.txt`, isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false }
      } finally { fixture.closed = true }
    })()
    return original.opendir(...args)
  } }
})
import { collectLegacyProofPaths, MAX_PROOF_DEPTH } from './legacy-proof'
import { accessVault } from './vault'
import { secretBoxRegistryPath } from './paths'
import { clearAccess, getAccess } from './session'

beforeEach(async () => {
  fixture.root = await fs.mkdtemp(join(tmpdir(), 'devfusion-proof-'))
  fixture.fail = fixture.burst = fixture.closed = false
})
afterEach(async () => { clearAccess(); await fs.rm(fixture.root, { recursive: true, force: true }) })

it('finds hidden legacy documents too and stops after the requested sample', async () => {
  await fs.mkdir(join(fixture.root, '.privatebox'))
  await fs.writeFile(join(fixture.root, '.privatebox', 'ignored.putl'), 'metadata')
  await fs.writeFile(join(fixture.root, '.hidden.putl'), 'encrypted')
  await fs.writeFile(join(fixture.root, 'visible.putl'), 'encrypted')
  expect(await collectLegacyProofPaths(fixture.root, 5)).toHaveLength(2)
  expect(await collectLegacyProofPaths(fixture.root, 1)).toHaveLength(1)
})

it('refuses excessive depth and closes the streaming iterator when the entry budget is exceeded', async () => {
  let path = fixture.root
  for (let i = 0; i <= MAX_PROOF_DEPTH; i++) { path = join(path, 'd'); await fs.mkdir(path) }
  await expect(collectLegacyProofPaths(fixture.root)).rejects.toThrow('depth limit')
  fixture.burst = true
  await expect(collectLegacyProofPaths(fixture.root)).rejects.toThrow('entry limit')
  expect(fixture.closed).toBe(true)
})

it('cancels scanning as soon as its session check fails', async () => {
  let checks = 0
  await expect(collectLegacyProofPaths(fixture.root, 5, () => { if (++checks === 3) throw new Error('SESSION_CHANGED') })).rejects.toThrow('SESSION_CHANGED')
})

it('refuses directory links instead of treating their hidden contents as an empty box', async () => {
  const target = join(fixture.root, 'target')
  await fs.mkdir(target)
  await fs.symlink(target, join(fixture.root, 'link'), process.platform === 'win32' ? 'junction' : 'dir')
  await expect(collectLegacyProofPaths(fixture.root)).rejects.toThrow('link')
})

it('does not bind a new password or rewrite legacy metadata when scanning fails', async () => {
  const box = join(fixture.root, 'box'), directory = join(box, '.privatebox')
  await fs.mkdir(directory, { recursive: true })
  const config = JSON.stringify({ version: 1, mode: 'portable', kdf: 'scrypt', kdfParams: SCRYPT_PARAMS, salt: Buffer.alloc(16, 7).toString('base64'), createdAt: '2026-10-08T00:00:00.000Z' })
  await fs.writeFile(join(directory, 'vault.json'), config)
  await fs.writeFile(join(box, 'document.putl'), 'existing encrypted bytes')
  await fs.writeFile(secretBoxRegistryPath(), JSON.stringify({ version: 1, activeId: 'fixture', vaults: [{ id: 'fixture', name: 'Fixture', rootPath: box, createdAt: '2026-10-08T00:00:00.000Z' }] }))
  fixture.fail = true
  await expect(accessVault({ keyA: 'wrong-key', keyB: 'wrong-password' })).rejects.toThrow('unreadable')
  expect(getAccess()).toBeNull()
  expect(await fs.readFile(join(directory, 'vault.json'), 'utf8')).toBe(config)
  expect(await fs.readFile(join(box, 'document.putl'), 'utf8')).toBe('existing encrypted bytes')
})
