import { createHash } from 'node:crypto'
import type { ClipContent } from '@shared/clipboard/types'

export function fingerprint(content: ClipContent): string {
  const hash = createHash('sha256')
  for (const field of ['text', 'html', 'png'] as const) {
    const value = content[field]
    hash.update(`${field}:${value === undefined ? -1 : value.length}:`)
    if (value !== undefined) hash.update(value, field === 'png' ? 'utf8' : 'utf16le')
  }
  return hash.digest('hex')
}
