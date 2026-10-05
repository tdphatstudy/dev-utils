import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, writeFile, rm } from 'fs/promises'
import { truncateSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { readBoundedFile } from './bounded-read'

let root = ''
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); root = '' })
it('reads bytes exactly and rejects oversized regular files before reading', async () => {
  root = await mkdtemp(join(tmpdir(), 'devutils-bounded-'))
  const path = join(root, 'fixture.txt')
  await writeFile(path, Buffer.from([0, 10, 255]))
  expect(await readBoundedFile(path, 3)).toEqual(Buffer.from([0, 10, 255]))
  await expect(readBoundedFile(path, 2)).rejects.toThrow('too large')
})
it('refuses a file that grows while reading and propagates session cancellation', async () => {
  root = await mkdtemp(join(tmpdir(), 'devutils-bounded-'))
  const path = join(root, 'fixture.txt')
  await writeFile(path, 'fixture')
  let checks = 0
  const result = readBoundedFile(path, 8, () => {
    if (++checks === 3) truncateSync(path, 100)
  })
  await expect(result).rejects.toThrow('changed')
  const canceled = vi.fn(() => { throw new Error('SESSION_CHANGED') })
  await expect(readBoundedFile(path, 8, canceled)).rejects.toThrow('SESSION_CHANGED')
})
