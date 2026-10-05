import { afterEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { SCRYPT_PARAMS, VAULT_DIR } from '@shared/secret-box/constants'
import { readMetadata, validateVaultConfig } from './metadata'

const roots: string[] = []
const valid = () => ({ version: 1, mode: 'portable', kdf: 'scrypt', kdfParams: { ...SCRYPT_PARAMS }, salt: Buffer.alloc(16, 7).toString('base64'), createdAt: '2026-10-04T00:00:00.000Z' })
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })

it('only treats an absent file as missing; corrupt metadata and backup bytes remain unchanged', async () => {
  const root = await mkdtemp(join(tmpdir(), 'devutils-metadata-')); roots.push(root)
  expect(await readMetadata(root)).toBeNull()
  const dir = join(root, VAULT_DIR), path = join(dir, 'vault.json')
  await mkdir(dir)
  const bad = '{"salt": "truncated'
  await writeFile(path, bad)
  await writeFile(`${path}.bak`, JSON.stringify(valid()))
  await expect(readMetadata(root)).rejects.toMatchObject({ code: 'CORRUPT' })
  expect(await readMetadata(root, true)).toEqual(valid())
  expect(await readFile(path, 'utf8')).toBe(bad)
  await writeFile(path, Buffer.from([0xff, 0xfe]))
  await expect(readMetadata(root)).rejects.toMatchObject({ code: 'CORRUPT' })
  await writeFile(path, Buffer.alloc(256 * 1024 + 1))
  await expect(readMetadata(root)).rejects.toMatchObject({ code: 'UNREADABLE' })
})

it('validates supported parameters and canonical salt, while retaining legacy metadata without auth', () => {
  expect(validateVaultConfig(valid(), 'fixture')).toEqual(valid())
  for (const value of [null, [], { ...valid(), salt: 'garbage' }, { ...valid(), salt: valid().salt.slice(0, -2) }, { ...valid(), mode: 'other' }, { ...valid(), auth: {} }]) expect(() => validateVaultConfig(value, 'fixture')).toThrow()
  for (const value of [{ ...valid(), version: 2 }, { ...valid(), kdfParams: { ...SCRYPT_PARAMS, N: 2 } }]) {
    try { validateVaultConfig(value, 'fixture'); throw new Error('Accepted unsupported metadata') }
    catch (e) { expect(e).toMatchObject({ code: 'UNSUPPORTED' }) }
  }
})
