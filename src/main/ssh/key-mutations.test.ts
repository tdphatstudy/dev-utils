import { afterEach, expect, it, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createSshKey, deleteSshKey, renameSshKey } from './crud'
import { listSshKeys, mergeExternalIdentityKeys, readPublicKeySafe } from './list-keys'
import { writeFile as mutationWriteFile, unlink as mutationUnlink } from 'fs/promises'
vi.mock('fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('fs/promises')>()
  return { ...original, writeFile: vi.fn(original.writeFile), unlink: vi.fn(original.unlink) }
})

const directories: string[] = []
async function fixture(): Promise<string> {
  const directory = await fs.mkdtemp(join(tmpdir(), 'devutils-ssh-mutation-'))
  directories.push(directory)
  return directory
}
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(directories.splice(0).map((path) => fs.rm(path, { recursive: true, force: true })))
})

it('backs up and restores a public-only key without inventing a private file', async () => {
  const dir = await fixture(), location = { sshDir: dir }
  const key = await createSshKey({ name: 'public_only', algorithm: 'ed25519' }, location)
  const publicBytes = await fs.readFile(key.publicPath)
  await fs.unlink(key.privatePath)
  const deleted = await deleteSshKey(key.publicPath, location)
  expect(deleted.removed).toBe(1)
  expect(deleted.recovery.keyPath).toBe(join(deleted.recovery.directory, 'public_only.pub'))
  const restored = await renameSshKey({ path: deleted.recovery.keyPath, newName: 'restored' }, location)
  expect(await fs.readFile(restored.publicPath!)).toEqual(publicBytes)
  await expect(fs.stat(restored.privatePath)).rejects.toMatchObject({ code: 'ENOENT' })
  expect((await listSshKeys(location))[0]).toMatchObject({ path: restored.publicPath, isPublic: true })
  await expect(renameSshKey({ path: join(dir, 'missing'), newName: 'missing' }, location)).rejects.toThrow('not found')
}, 15_000)

it('renames exact key bytes exclusively; a second publication failure leaves originals intact', async () => {
  const dir = await fixture(), location = { sshDir: dir }
  const key = await createSshKey({ name: 'old', algorithm: 'ed25519' }, location)
  const privateBytes = await fs.readFile(key.privatePath), publicBytes = await fs.readFile(key.publicPath)
  const targetPublic = join(dir, 'new.pub')
  const realWrite = (await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')).writeFile
  const write = vi.mocked(mutationWriteFile).mockImplementation(async (...args: Parameters<typeof fs.writeFile>) => {
    if (String(args[0]) === targetPublic) throw Object.assign(new Error('fixture write failure'), { code: 'EACCES' })
    return realWrite(...args)
  })
  try { await expect(renameSshKey({ path: key.privatePath, newName: 'new' }, location)).rejects.toThrow('fixture write failure') }
  finally { write.mockImplementation(realWrite) }
  expect(await fs.readFile(key.privatePath)).toEqual(privateBytes)
  expect(await fs.readFile(key.publicPath)).toEqual(publicBytes)
  await expect(fs.stat(join(dir, 'new'))).rejects.toMatchObject({ code: 'ENOENT' })
  const renamed = await renameSshKey({ path: key.privatePath, newName: 'new' }, location)
  expect(await fs.readFile(renamed.privatePath)).toEqual(privateBytes)
  expect(await fs.readFile(renamed.publicPath!)).toEqual(publicBytes)
  await expect(fs.stat(key.privatePath)).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(renameSshKey({ path: renamed.privatePath, newName: 'new.pub' }, location)).resolves.toEqual(renamed)
}, 15_000)

it('delete keeps a byte-for-byte backup that can be restored without overwriting another key', async () => {
  const dir = await fixture(), location = { sshDir: dir }
  const key = await createSshKey({ name: 'recover', algorithm: 'ed25519' }, location)
  const original = await fs.readFile(key.privatePath), publicBytes = await fs.readFile(key.publicPath)
  const deleted = await deleteSshKey(key.publicPath, location)
  expect(await fs.readFile(deleted.recovery.keyPath)).toEqual(original)
  expect(await fs.readFile(join(deleted.recovery.directory, 'recover.pub'))).toEqual(publicBytes)
  await expect(fs.stat(key.privatePath)).rejects.toMatchObject({ code: 'ENOENT' })
  const restored = await renameSshKey({ path: deleted.recovery.keyPath, newName: 'recover' }, location)
  expect(await fs.readFile(restored.privatePath)).toEqual(original)
  expect(await fs.readFile(restored.publicPath!)).toEqual(publicBytes)
}, 15_000)

it('overwrite preserves the original pair and supports recovery under a different name', async () => {
  const dir = await fixture(), location = { sshDir: dir }
  const old = await createSshKey({ name: 'replace', algorithm: 'ed25519' }, location)
  const oldBytes = await fs.readFile(old.privatePath), oldPublic = await fs.readFile(old.publicPath)
  const replacement = await createSshKey({ name: 'replace', algorithm: 'ed25519', overwrite: true }, location)
  expect(await fs.readFile(replacement.privatePath)).not.toEqual(oldBytes)
  expect(await fs.readFile(replacement.recovery!.keyPath)).toEqual(oldBytes)
  await expect(renameSshKey({ path: replacement.recovery!.keyPath, newName: 'replace' }, location)).rejects.toThrow('already exists')
  const recovered = await renameSshKey({ path: replacement.recovery!.keyPath, newName: 'recovered' }, location)
  expect(await fs.readFile(recovered.privatePath)).toEqual(oldBytes)
  expect(await fs.readFile(recovered.publicPath!)).toEqual(oldPublic)
}, 15_000)

it('partial deletion exposes recovery metadata and preserves a complete backup', async () => {
  const dir = await fixture(), location = { sshDir: dir }
  const key = await createSshKey({ name: 'partial', algorithm: 'ed25519' }, location)
  const privateBytes = await fs.readFile(key.privatePath), publicBytes = await fs.readFile(key.publicPath)
  const realUnlink = (await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')).unlink
  const unlink = vi.mocked(mutationUnlink).mockImplementation(async (path) => {
    if (String(path) === key.publicPath) throw Object.assign(new Error('fixture delete failure'), { code: 'EACCES' })
    return realUnlink(path)
  })
  let result
  try { result = await deleteSshKey(key.privatePath, location) }
  finally { unlink.mockImplementation(realUnlink) }
  expect(result).toMatchObject({ removed: 1, error: expect.stringContaining('1/2') })
  expect(await fs.readFile(result.recovery.keyPath)).toEqual(privateBytes)
  expect(await fs.readFile(join(result.recovery.directory, 'partial.pub'))).toEqual(publicBytes)
  expect(await fs.readFile(key.publicPath)).toEqual(publicBytes)
}, 15_000)

it('protects custom config, unrelated files, directories and destination collisions', async () => {
  const dir = await fixture(), configPath = join(dir, 'company-config'), location = { sshDir: dir, configPath }
  await fs.writeFile(configPath, 'Host box\n User deploy\n')
  await expect(deleteSshKey(configPath, location)).rejects.toThrow('protected')
  await expect(renameSshKey({ path: configPath, newName: 'new' }, location)).rejects.toThrow('protected')
  await expect(createSshKey({ name: 'company-config', algorithm: 'ed25519', overwrite: true }, location)).rejects.toThrow('protected')
  await fs.writeFile(join(dir, 'notes'), 'ordinary user data')
  await expect(deleteSshKey(join(dir, 'notes'), location)).rejects.toThrow('private key')
  const key = await createSshKey({ name: 'old', algorithm: 'ed25519' }, location)
  await fs.mkdir(join(dir, 'occupied.pub'))
  await expect(renameSshKey({ path: key.privatePath, newName: 'occupied' }, location)).rejects.toThrow('regular file')
  expect(await fs.readFile(join(dir, 'notes'), 'utf8')).toBe('ordinary user data')
  expect(await fs.readFile(configPath, 'utf8')).toBe('Host box\n User deploy\n')
}, 15_000)

it('inventory groups a pair and excludes ordinary/protected files; public reads are bounded and authorized', async () => {
  const dir = await fixture(), outside = await fixture(), location = { sshDir: dir }
  const key = await createSshKey({ name: 'pair', algorithm: 'ed25519' }, location)
  await fs.writeFile(join(dir, 'authorized_keys'), key.publicKeyOpenSsh)
  await fs.writeFile(join(dir, 'notes'), 'ordinary file')
  await fs.mkdir(join(dir, 'folder'))
  const inventory = await listSshKeys(location)
  expect(inventory).toHaveLength(1)
  expect(inventory[0]).toMatchObject({ path: key.privatePath, publicPath: key.publicPath, isPublic: false })
  const external = join(outside, 'external.pub')
  await fs.writeFile(external, key.publicKeyOpenSsh)
  await expect(readPublicKeySafe(external, location)).rejects.toThrow('referenced')
  await fs.writeFile(join(dir, 'config'), `Host box\n IdentityFile "${external.replace(/\\/g, '/')}"\n`)
  expect(await readPublicKeySafe(external, location)).toBe(key.publicKeyOpenSsh)
  const merged = await mergeExternalIdentityKeys(inventory, [external], location)
  expect(merged.find((entry) => entry.path === external)?.external).toBe(true)
  await fs.writeFile(join(dir, 'large.pub'), Buffer.alloc(65 * 1024, 65))
  await expect(readPublicKeySafe(join(dir, 'large.pub'), location)).rejects.toThrow('64 KiB')
}, 15_000)

it('can inspect and rename an existing key with spaces and Unicode', async () => {
  const dir = await fixture(), location = { sshDir: dir }
  const key = await createSshKey({ name: 'source', algorithm: 'ed25519' }, location)
  const imported = join(dir, 'khóa công việc')
  await fs.rename(key.privatePath, imported)
  await fs.rename(key.publicPath, `${imported}.pub`)
  expect((await listSshKeys(location))[0].name).toBe('khóa công việc')
  const bytes = await fs.readFile(imported)
  const renamed = await renameSshKey({ path: imported, newName: 'portable' }, location)
  expect(await fs.readFile(renamed.privatePath)).toEqual(bytes)
}, 15_000)
