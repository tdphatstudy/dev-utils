import { expect, it } from 'vitest'
import { pixelRect, validateOcrInput, validateOcrResult, validateImageSize, MAX_OCR_BYTES } from './types'

it('rejects URLs, disguised files, unsupported languages and oversized binary IPC', () => {
  const png = new Uint8Array(24); png.set([137, 80, 78, 71, 13, 10, 26, 10]); new DataView(png.buffer).setUint32(16, 100); new DataView(png.buffer).setUint32(20, 100)
  expect(validateOcrInput({ bytes: png, kind: 'image', language: 'eng+vie' }).bytes).toBe(png)
  expect(validateOcrInput({ bytes: new TextEncoder().encode('%PDF-1.7\n'), kind: 'pdf', language: 'vie' }).kind).toBe('pdf')
  for (const value of [null, { bytes: 'https://example.com/private.png' }, { bytes: png, kind: 'pdf', language: 'eng' }, { bytes: png, kind: 'image', language: '../../secret' }, { bytes: new Uint8Array(MAX_OCR_BYTES + 1), kind: 'image', language: 'eng' }]) expect(() => validateOcrInput(value)).toThrow()
})
it('rejects decompression bombs from headers before allocating a bitmap', () => {
  const png = new Uint8Array(24); png.set([137, 80, 78, 71]); const d = new DataView(png.buffer)
  d.setUint32(16, 100000); d.setUint32(20, 100000)
  expect(() => validateImageSize(png)).toThrow('16 million')
  const gif = new Uint8Array(10); gif.set([71, 73, 70, 56]); const g = new DataView(gif.buffer); g.setUint16(6, 1200, true); g.setUint16(8, 800, true)
  expect(() => validateImageSize(gif)).not.toThrow()
  expect(() => validateImageSize(new Uint8Array([255, 216, 255]))).toThrow()
})
it('maps normalized regions onto native pixels for mixed DPI and reverse dragging', () => {
  expect(pixelRect({ x: .1, y: .2, width: .5, height: .3 }, 3840, 2160)).toEqual({ x: 384, y: 432, width: 1920, height: 648 })
  for (const rect of [{ x: -1, y: 0, width: 1, height: 1 }, { x: .9, y: 0, width: .2, height: 1 }, { x: 0, y: 0, width: 0, height: 1 }, { x: NaN, y: 0, width: 1, height: 1 }]) expect(() => pixelRect(rect, 1920, 1080)).toThrow()
  expect(() => pixelRect({ x: 0, y: 0, width: 1, height: 1 }, 10000, 10000)).toThrow('16 million')
})
it('bounds untrusted output and preserves literal HTML as text', () => {
  expect(validateOcrResult({ text: '<script>private</script>', pages: 1, ocrPages: 1, confidence: 91 }).text).toBe('<script>private</script>')
  for (const value of [{ text: 'x', pages: 51, ocrPages: 1 }, { text: 'x', pages: 1, ocrPages: 2 }, { text: 'x', pages: 1, ocrPages: 1, confidence: NaN }, { text: 'x'.repeat(2_000_001), pages: 1, ocrPages: 1 }]) expect(() => validateOcrResult(value)).toThrow()
})
