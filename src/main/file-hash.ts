import { createHash } from 'node:crypto'
import { open, stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { FILE_HASH_ALGORITHMS, type HashAlgorithm } from '@shared/file/hash'

export function validateFilePath(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value || value.length > 32768 || value.includes('\0') || !isAbsolute(value)) {
    throw new Error('Choose a file with a valid absolute path.')
  }
}

/** Fixed-size streaming; reject a changed or replaced file instead of publishing a misleading checksum. */
export async function hashFile(payload: unknown, options: { signal?: AbortSignal; onProgress?: (bytesRead: number, totalBytes: number) => void } = {}): Promise<string> {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid file hash request.')
  const { path, algorithm } = payload as { path?: unknown; algorithm?: unknown }
  validateFilePath(path)
  if (!FILE_HASH_ALGORITHMS.includes(algorithm as HashAlgorithm)) throw new Error('Unsupported hash algorithm.')
  options.signal?.throwIfAborted()
  const handle = await open(path, 'r')
  try {
    options.signal?.throwIfAborted()
    const before = await handle.stat()
    if (!before.isFile()) throw new Error('Choose a regular file, not a folder or device.')
    const hash = createHash(algorithm as HashAlgorithm)
    let bytes = 0
    let lastReport = Date.now()
    options.onProgress?.(0, before.size)
    options.signal?.throwIfAborted()
    for await (const chunk of handle.createReadStream({ highWaterMark: 64 * 1024, autoClose: false, signal: options.signal })) {
      options.signal?.throwIfAborted()
      bytes += chunk.length
      hash.update(chunk)
      if (Date.now() - lastReport >= 100) {
        options.onProgress?.(bytes, before.size)
        lastReport = Date.now()
      }
    }
    options.signal?.throwIfAborted()
    const after = await handle.stat()
    const current = await stat(path)
    if (bytes !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs ||
        after.ctimeMs !== before.ctimeMs || current.ino !== after.ino || current.dev !== after.dev ||
        current.size !== after.size || current.mtimeMs !== after.mtimeMs || current.ctimeMs !== after.ctimeMs) {
      throw new Error('The file changed while hashing. Wait for writes to finish and try again.')
    }
    options.signal?.throwIfAborted()
    options.onProgress?.(bytes, before.size)
    return hash.digest('hex')
  } finally { await handle.close() }
}
