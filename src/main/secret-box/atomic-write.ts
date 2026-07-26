import { randomBytes } from 'crypto'
import { rename as fsRename, unlink, writeFile, mkdir } from 'fs/promises'
import { basename, dirname, join } from 'path'

/**
 * Atomic-ish replace: write temp in same directory then rename into place.
 * On Windows, rename cannot overwrite — swap via .bak then remove bak.
 * Prevents truncated vault.json / .putl if the process dies mid-write.
 */
export async function atomicWriteFile(
  filePath: string,
  data: string | Buffer,
  encoding: BufferEncoding = 'utf8'
): Promise<void> {
  const dir = dirname(filePath)
  await mkdir(dir, { recursive: true })
  const token = randomBytes(6).toString('hex')
  const tmp = join(dir, `.${basename(filePath)}.${process.pid}.${token}.tmp`)
  const bak = join(dir, `.${basename(filePath)}.${token}.bak`)

  if (typeof data === 'string') {
    await writeFile(tmp, data, encoding)
  } else {
    await writeFile(tmp, data)
  }

  try {
    await fsRename(tmp, filePath)
    return
  } catch {
    /* Windows or target exists — swap */
  }

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
