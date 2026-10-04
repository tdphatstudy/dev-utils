import { describe, expect, it } from 'vitest'
import { convertLineEndings, detectLineEnding, countLines, lineEndingCounts } from './text'

describe('line endings', () => {
  it('counts mixed endings without counting the LF part of CRLF twice', () => {
    expect(lineEndingCounts('a\r\nb\nc\rd\r\n')).toEqual({ crlf: 2, lf: 1, cr: 1 })
    expect(countLines('a\r\nb\nc\rd\r\n')).toBe(5)
  })
  it.each(['lf', 'crlf', 'cr'] as const)('preserves text and final-newline presence when converting to %s', (target) => {
    const ending = target === 'lf' ? '\n' : target === 'crlf' ? '\r\n' : '\r'
    expect(convertLineEndings('a\r\nb\nc\r', target)).toBe(`a${ending}b${ending}c${ending}`)
    expect(convertLineEndings('a\r\nb', target)).toBe(`a${ending}b`)
    expect(convertLineEndings('', target)).toBe('')
  })
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
