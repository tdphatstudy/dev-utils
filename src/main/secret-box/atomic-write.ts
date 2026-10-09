import { randomBytes } from 'crypto'
import { rename as fsRename, unlink, writeFile, mkdir } from 'fs/promises'
import { basename, dirname, join } from 'path'

/**
 * Write a sibling temporary file and rename it into place. The fallback retains
 * the previous file for restoration if replacement fails. This is not an fsync
 * durability guarantee against power loss.
 */
export async function atomicWriteFile(
  filePath: string,
  data: string | Buffer,
  encoding: BufferEncoding = 'utf8',
  mode?: number,
  beforeCommit?: () => void
): Promise<void> {
  const dir = dirname(filePath)
  await mkdir(dir, { recursive: true })
  const token = randomBytes(6).toString('hex')
  const tmp = join(dir, `.${basename(filePath)}.${process.pid}.${token}.tmp`)
  const bak = join(dir, `.${basename(filePath)}.${token}.bak`)

  if (typeof data === 'string') {
    await writeFile(tmp, data, { encoding, mode, flag: 'wx' })
  } else {
    await writeFile(tmp, data, { mode, flag: 'wx' })
  }

  try { beforeCommit?.() }
  catch (e) { await unlink(tmp).catch(() => undefined); throw e }

  try {
    await fsRename(tmp, filePath)
    return
  } catch {
    /* Windows or target exists — swap */
  }

  try { beforeCommit?.() }
  catch (e) { await unlink(tmp).catch(() => undefined); throw e }

  try {
    try {
      await unlink(bak)
    } catch {
      /* none */
    }
    try {
      await fsRename(filePath, bak)
    } catch {
      /* target may not exist */
    }
    beforeCommit?.()
    await fsRename(tmp, filePath)
    try {
      await unlink(bak)
    } catch {
      /* keep bak if unlink fails — still have good file */
    }
  } catch (e) {
    try {
      await fsRename(bak, filePath)
    } catch {
      /* best effort restore */
    }
    try {
      await unlink(tmp)
    } catch {
      /* ignore */
    }
    throw e
  }
}

/** Copy existing file to path.bak before mutation (vault config backup). */
export async function backupFile(filePath: string, suffix = '.bak'): Promise<void> {
  const { copyFile, access, constants } = await import('fs/promises')
  try {
    await access(filePath, constants.F_OK)
  } catch {
    return
  }
  const dest = `${filePath}${suffix}`
  await copyFile(filePath, dest)
}
