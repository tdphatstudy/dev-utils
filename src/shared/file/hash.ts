export const FILE_HASH_ALGORITHMS = ['sha256', 'sha512', 'sha1', 'md5'] as const
export type HashAlgorithm = typeof FILE_HASH_ALGORITHMS[number]
export interface FileHashProgress { requestId: string; bytesRead: number; totalBytes: number }

export function compareChecksum(actual: string, expected: string, algorithm: HashAlgorithm): 'empty' | 'invalid' | 'match' | 'mismatch' {
  const value = expected.trim()
  if (!value) return 'empty'
  const lengths: Record<HashAlgorithm, number> = { md5: 32, sha1: 40, sha256: 64, sha512: 128 }
  if (value.length !== lengths[algorithm] || !/^[a-f0-9]+$/i.test(value)) return 'invalid'
  return value.toLowerCase() === actual.toLowerCase() ? 'match' : 'mismatch'
}
