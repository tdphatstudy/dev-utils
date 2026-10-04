import { afterEach, expect, it, vi } from 'vitest'
import { appendFile, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const control = vi.hoisted(() => ({ afterChunk: null as (() => Promise<void>) | null }))
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, open: async (...args: Parameters<typeof actual.open>) => {
    const handle = await actual.open(...args)
    return {
      stat: handle.stat.bind(handle),
      close: handle.close.bind(handle),
      createReadStream: (options: Parameters<typeof handle.createReadStream>[0]) => {
        const stream = handle.createReadStream(options)
        return (async function* () {
          for await (const chunk of stream) {
            const action = control.afterChunk
            control.afterChunk = null
            if (action) await action()
            yield chunk
          }
        })()
      }
    }
  } }
})
import { hashFile } from './file-hash'
const directories: string[] = []
afterEach(async () => {
  control.afterChunk = null
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

it.each(['append', 'timestamp'] as const)('rejects a real %s during streamed reading', async (mode) => {
  const directory = await mkdtemp(join(tmpdir(), 'devutils-hash-change-'))
  directories.push(directory)
  const path = join(directory, 'changing.bin')
  await writeFile(path, Buffer.alloc(1024 * 1024, 42))
  control.afterChunk = () => mode === 'append' ? appendFile(path, Buffer.from('changed')) : utimes(path, new Date(0), new Date(0))
  await expect(hashFile({ path, algorithm: 'sha256' })).rejects.toThrow('file changed')
})

it('aborts after a chunk is actually read and releases the handle for the next read', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'devutils-hash-abort-'))
  directories.push(directory)
  const path = join(directory, 'cancel.bin')
  await writeFile(path, Buffer.alloc(1024 * 1024, 42))
  const abort = new AbortController()
  control.afterChunk = async () => { abort.abort() }
  await expect(hashFile({ path, algorithm: 'sha256' }, { signal: abort.signal })).rejects.toThrow()
  expect(await hashFile({ path, algorithm: 'sha256' })).toHaveLength(64)
})
