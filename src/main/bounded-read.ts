import { constants } from 'fs'
import { lstat, open } from 'fs/promises'

/** Read one stable regular file. Never allocate or follow growth beyond the limit. */
export async function readBoundedFile(path: string, maxBytes: number, check: () => void = () => {}): Promise<Buffer> {
  check()
  const before = await lstat(path)
  check()
  if (!before.isFile() || before.isSymbolicLink()) throw new Error('Choose a regular file, not a link.')
  if (before.size > maxBytes) throw new Error(`File too large. Maximum ${Math.round(maxBytes / (1024 * 1024))} MiB; existing files were not changed.`)
  const flags = constants.O_RDONLY | (process.platform === 'win32' ? 0 : constants.O_NOFOLLOW | constants.O_NONBLOCK)
  const file = await open(path, flags)
  try {
    const initial = await file.stat()
    check()
    if (!initial.isFile() || initial.size !== before.size || initial.dev !== before.dev || initial.ino !== before.ino) throw new Error('File changed while opening. Retry after checking it.')
    const bytes = Buffer.alloc(initial.size)
    let offset = 0
    while (offset < bytes.length) {
      const { bytesRead } = await file.read(bytes, offset, Math.min(64 * 1024, bytes.length - offset), offset)
      check()
      if (!bytesRead) break
      offset += bytesRead
    }
    const after = await file.stat()
    check()
    if (offset !== bytes.length || after.size !== initial.size || after.mtimeMs !== initial.mtimeMs || after.ctimeMs !== initial.ctimeMs) throw new Error('File changed while reading. Retry after checking it.')
    return bytes
  } finally { await file.close() }
}
