import { describe, expect, it } from 'vitest'
import { decodeBase64, decodeBase64Bytes, encodeBase64 } from './index'
import { bytesToBase64, parseImageBase64, imageBytesToDataUrl } from './image'

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf1sAAAAASUVORK5CYII='

describe('Base64 codec', () => {
  it.each(['standard', 'url'] as const)('roundtrips exact UTF-8 including BOM with %s', (variant) => {
    for (const text of ['', 'a', 'ab', 'abc', 'Tiếng Việt 🔒\n', '\ufeffhello']) {
      expect(decodeBase64(encodeBase64(text, variant), variant)).toEqual({ ok: true, text })
    }
  })
  it('accepts whitespace and missing padding', () => {
    expect(decodeBase64('Z g\n')).toEqual({ ok: true, text: 'f' })
    expect(decodeBase64('Zg==')).toEqual({ ok: true, text: 'f' })
  })
  it.each(['A', 'Zg=', '=Zg=', 'Zg===', 'Zh==', 'Zg==garbage', 'Zg?=', '-w=='])('rejects malformed standard Base64 %s', (input) => {
    expect(decodeBase64Bytes(input).ok).toBe(false)
  })
  it('does not silently replace binary bytes with Unicode replacement characters', () => {
    expect(decodeBase64('/w==').ok).toBe(false)
    const result = decodeBase64Bytes('_w', 'url')
    expect(result.ok && [...result.bytes]).toEqual([255])
  })
})

describe('image Base64', () => {
  it('recognizes UTF-8 SVG without converting its content', () => {
    const text = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><text>✓</text></svg>'
    expect(parseImageBase64(encodeBase64(text))).toMatchObject({ ok: true, meta: { mime: 'image/svg+xml' } })
  })
  it('detects raw PNG and multiline data URLs', () => {
    expect(parseImageBase64(PNG)).toMatchObject({ ok: true, meta: { mime: 'image/png', byteLength: 68 } })
    expect(parseImageBase64(`data:image/png;base64,\n${PNG}`)).toMatchObject({ ok: true, meta: { mime: 'image/png' } })
  })
  it('rejects non-image bytes, false MIME claims and oversized input', () => {
    expect(parseImageBase64('aGVsbG8=').ok).toBe(false)
    expect(parseImageBase64(`data:image/jpeg;base64,${PNG}`).ok).toBe(false)
    expect(parseImageBase64('A'.repeat(12 * 1024 * 1024 + 1))).toMatchObject({ ok: false, error: expect.stringContaining('limit') })
    expect(() => imageBytesToDataUrl(new Uint8Array([1, 2]), 'image/png')).toThrow(/Unsupported/)
  })
  it('encodes bytes exactly across chunk boundaries', () => {
    const bytes = new Uint8Array(70_000).map((_, index) => index % 256)
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'))
  })
})
