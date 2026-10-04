import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { hashFile } from './file-hash'
import { FILE_HASH_ALGORITHMS } from '@shared/file/hash'

const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))) })
async function fixture(bytes: Buffer): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'devutils-hash-'))
  directories.push(directory)
  const path = join(directory, 'input.bin')
  await writeFile(path, bytes)
  return path
}
describe('streamed file hashing', () => {
  it('matches independent digests across many chunks for every algorithm', async () => {
    const bytes = Buffer.alloc(2 * 1024 * 1024 + 17)
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + (i >>> 8)) & 255
    const path = await fixture(bytes)
    for (const algorithm of FILE_HASH_ALGORITHMS) {
      expect(await hashFile({ path, algorithm })).toBe(createHash(algorithm).update(bytes).digest('hex'))
    }
  })
  it('supports empty files', async () => {
    const path = await fixture(Buffer.alloc(0))
    expect(await hashFile({ path, algorithm: 'sha256' })).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })
  it('rejects directories and missing files', async () => {
    const path = await fixture(Buffer.from('test'))
    await expect(hashFile({ path: directories[0], algorithm: 'sha256' })).rejects.toThrow()
    await expect(hashFile({ path: path + '.missing', algorithm: 'sha256' })).rejects.toThrow()
  })
  it('validates untrusted request payloads before opening files', async () => {
    for (const payload of [null, {}, { path: 'relative', algorithm: 'md5' }, { path: 1, algorithm: 'md5' }, { path: join(tmpdir(), 'x'), algorithm: 'shake256' }]) {
      await expect(hashFile(payload)).rejects.toThrow()
    }
  })
  it('reports byte progress and handles cancellation at the initial progress event', async () => {
    const path = await fixture(Buffer.alloc(1024 * 1024, 7))
    const events: number[] = []
    expect(await hashFile({ path, algorithm: 'sha256' }, { onProgress: (bytes, total) => {
      events.push(bytes)
      expect(total).toBe(1024 * 1024)
    } })).toHaveLength(64)
    expect(events[0]).toBe(0)
    expect(events.at(-1)).toBe(1024 * 1024)
    const abort = new AbortController()
    await expect(hashFile({ path, algorithm: 'sha256' }, { signal: abort.signal, onProgress: () => abort.abort() })).rejects.toThrow()
    // A fresh read succeeds after the aborted stream releases its handle.
    expect(await hashFile({ path, algorithm: 'sha256' })).toHaveLength(64)
  })
})
