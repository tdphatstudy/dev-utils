import { describe, expect, it } from 'vitest'
import { convertLineEndings, detectLineEnding } from './text'

describe('line endings', () => {
  it('detects lf', () => {
    expect(detectLineEnding('a\nb\n')).toBe('lf')
  })

  it('detects crlf', () => {
    expect(detectLineEnding('a\r\nb\r\n')).toBe('crlf')
  })

  it('detects mixed', () => {
    expect(detectLineEnding('a\nb\r\n')).toBe('mixed')
  })

  it('converts to crlf', () => {
    expect(convertLineEndings('a\nb', 'crlf')).toBe('a\r\nb')
  })

  it('converts crlf to lf', () => {
    expect(convertLineEndings('a\r\nb\r\n', 'lf')).toBe('a\nb\n')
  })
})
