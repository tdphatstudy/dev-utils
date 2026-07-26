import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtemp, readFile, writeFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { atomicWriteFile, backupFile } from './atomic-write'

describe('atomicWriteFile', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'devutils-atomic-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('creates new file', async () => {
    const p = join(dir, 'a.json')
    await atomicWriteFile(p, '{"ok":true}\n')
    expect(await readFile(p, 'utf8')).toBe('{"ok":true}\n')
  })

  it('replaces existing without leaving empty file', async () => {
    const p = join(dir, 'vault.json')
    await writeFile(p, 'OLD_CONTENT_THAT_MUST_SURVIVE_IF_CRASH', 'utf8')
    await atomicWriteFile(p, 'NEW_SAFE_CONTENT')
    expect(await readFile(p, 'utf8')).toBe('NEW_SAFE_CONTENT')
  })

  it('backupFile copies when present', async () => {
    const p = join(dir, 'vault.json')
    await writeFile(p, 'original', 'utf8')
    await backupFile(p, '.bak')
    expect(await readFile(p + '.bak', 'utf8')).toBe('original')
  })
})
