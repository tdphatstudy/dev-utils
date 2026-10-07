import { searchHash, type HashSearchInput } from '@shared/security-testing/hash-search'
import { hashText, type TextHashAlgorithm } from '@shared/crypto/hash'

const scope = globalThis as unknown as { onmessage: ((event: MessageEvent<{ input: HashSearchInput } | { text: string; algorithm: TextHashAlgorithm }>) => void) | null; postMessage: (value: unknown) => void }
scope.onmessage = async ({ data }) => {
  try {
    if ('input' in data) {
      const result = await searchHash(data.input, progress => scope.postMessage({ kind: 'progress', result: progress }))
      scope.postMessage({ kind: 'done', result })
    } else {
      if (!['MD5', 'SHA-1', 'SHA-256', 'SHA-512'].includes(data.algorithm) || typeof data.text !== 'string' || data.text.length > 1024 * 1024) throw new Error('Choose a supported algorithm and text up to 1 Mi characters.')
      scope.postMessage({ kind: 'hash', hash: await hashText(data.text, data.algorithm) })
    }
  } catch (error) { scope.postMessage({ kind: 'error', error: error instanceof Error ? error.message : 'Hash operation failed.' }) }
}
