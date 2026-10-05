import { describe, expect, it } from 'vitest'
import { convertLineEndings, decodeUtf8Text, detectLineEnding, countLines, lineEndingCounts } from './text'

describe('line endings', () => {
  it('preserves UTF-8 BOM and Unicode bytes through a file line-ending conversion', () => {
    const bytes = new TextEncoder().encode('\uFEFFTiếng Việt\r\nemoji 🙂\nlast').buffer
    const input = decodeUtf8Text(bytes, true)
    expect(input.charCodeAt(0)).toBe(0xfeff)
    const output = new TextEncoder().encode(convertLineEndings(input, 'crlf'))
    expect(output).toEqual(new TextEncoder().encode('\uFEFFTiếng Việt\r\nemoji 🙂\r\nlast'))
    expect(decodeUtf8Text(bytes)).toBe('Tiếng Việt\r\nemoji 🙂\nlast')
  })
  it('refuses malformed UTF-8 and UTF-16 rather than replacing undecodable content', () => {
    for (const bytes of [[0xc3, 0x28], [0xff, 0xfe, 0x61, 0], [0xe2, 0x82]]) {
      expect(() => decodeUtf8Text(new Uint8Array(bytes).buffer, true)).toThrow()
    }
  })
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
