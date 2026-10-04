import { describe, expect, it } from 'vitest'
import { compareChecksum } from './hash'

describe('checksum comparison', () => {
  it('compares trimmed case-insensitive hex without silently removing internal whitespace', () => {
    const checksum = 'ab'.repeat(32)
    expect(compareChecksum(checksum, ` \n${checksum.toUpperCase()}\n`, 'sha256')).toBe('match')
    expect(compareChecksum(checksum, 'cd'.repeat(32), 'sha256')).toBe('mismatch')
    expect(compareChecksum(checksum, 'ab '.repeat(32), 'sha256')).toBe('invalid')
    expect(compareChecksum(checksum, 'zz'.repeat(32), 'sha256')).toBe('invalid')
    expect(compareChecksum(checksum, ' ', 'sha256')).toBe('empty')
  })
  it('requires lengths appropriate for the selected algorithm', () => {
    for (const [algorithm, length] of [['md5', 32], ['sha1', 40], ['sha256', 64], ['sha512', 128]] as const) {
      const value = 'a'.repeat(length)
      expect(compareChecksum(value, value, algorithm)).toBe('match')
      expect(compareChecksum(value, value.slice(1), algorithm)).toBe('invalid')
    }
  })
})
