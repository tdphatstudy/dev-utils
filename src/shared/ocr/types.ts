export const OCR_LANGUAGES = ['eng', 'vie', 'eng+vie'] as const
export type OcrLanguage = typeof OCR_LANGUAGES[number]
export type CaptureMode = 'screen' | 'region'
export const MAX_OCR_BYTES = 32 * 1024 * 1024
export const MAX_OCR_PIXELS = 16_000_000
export const MAX_OCR_PAGES = 50
export const MAX_OCR_TEXT = 2_000_000
export type OcrInput = { bytes: Uint8Array; kind: 'image' | 'pdf'; language: OcrLanguage; forceOcr?: boolean }
export type OcrRequest = OcrInput & { id: string }
export type OcrCaptureRequest = { id: string; mode: CaptureMode; language: OcrLanguage }
export type OcrResult = { text: string; pages: number; ocrPages: number; confidence?: number }
export type OcrProgress = { id: string; stage: string; page: number; total: number; percent: number }
export type OcrRect = { x: number; y: number; width: number; height: number }
export type OcrSelection = { rect: OcrRect; bytes: Uint8Array }
export type OcrView = { kind: 'region'; image: string; width: number; height: number } | { kind: 'run'; input: OcrInput } | { kind: 'result'; result: OcrResult }

export function validateLanguage(value: unknown): OcrLanguage {
  if (!OCR_LANGUAGES.includes(value as OcrLanguage)) throw new Error('Choose English, Vietnamese or both.')
  return value as OcrLanguage
}
export function validateOcrId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(value)) throw new Error('Invalid OCR request.')
  return value
}
export function validateOcrInput(value: unknown): OcrInput {
  const input = value as OcrInput | null
  if (!input || !(input.bytes instanceof Uint8Array) || !input.bytes.byteLength || input.bytes.byteLength > MAX_OCR_BYTES) throw new Error('Choose an image or PDF up to 32 MB.')
  validateLanguage(input.language)
  if (input.forceOcr !== undefined && typeof input.forceOcr !== 'boolean') throw new Error('Invalid PDF extraction mode.')
  const b = input.bytes
  const pdf = b[0] === 37 && b[1] === 80 && b[2] === 68 && b[3] === 70 && b[4] === 45
  const image = (b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71) ||
    (b[0] === 255 && b[1] === 216 && b[2] === 255) ||
    (b[0] === 71 && b[1] === 73 && b[2] === 70 && b[3] === 56) ||
    (b[0] === 66 && b[1] === 77) ||
    (b[0] === 82 && b[1] === 73 && b[2] === 70 && b[3] === 70 && b[8] === 87 && b[9] === 69 && b[10] === 66 && b[11] === 80)
  if ((input.kind !== 'pdf' || !pdf) && (input.kind !== 'image' || !image)) throw new Error('Supported files: PNG, JPEG, WebP, GIF, BMP and PDF. The file content must match its type.')
  if (input.kind === 'image') validateImageSize(input.bytes)
  return { bytes: input.bytes, kind: input.kind, language: input.language, forceOcr: input.forceOcr }
}

// Inspect dimensions before the browser decoder allocates pixel buffers. These
// headers describe the first frame; animated images are recognized as one frame.
export function validateImageSize(bytes: Uint8Array): { width: number; height: number } {
  const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let width = 0, height = 0
  try {
    if (bytes[0] === 137) { width = d.getUint32(16); height = d.getUint32(20) }
    else if (bytes[0] === 71) { width = d.getUint16(6, true); height = d.getUint16(8, true) }
    else if (bytes[0] === 66) {
      if (d.getUint32(14, true) === 12) { width = d.getUint16(18, true); height = d.getUint16(20, true) }
      else { width = d.getInt32(18, true); height = Math.abs(d.getInt32(22, true)) }
    } else if (bytes[0] === 255) {
      let offset = 2, headers = 0
      while (offset + 8 < bytes.length && headers++ < 10000) {
        if (bytes[offset++] !== 255) break
        while (bytes[offset] === 255) offset++
        const marker = bytes[offset++]
        if (marker === 216 || marker === 1 || (marker >= 208 && marker <= 215)) continue
        if (marker === 218 || marker === 217) break
        const length = d.getUint16(offset)
        if (length < 2 || offset + length > bytes.length) break
        if (marker >= 192 && marker <= 207 && ![196, 200, 204].includes(marker)) { height = d.getUint16(offset + 3); width = d.getUint16(offset + 5); break }
        offset += length
      }
    } else if (bytes[0] === 82) {
      const tag = String.fromCharCode(...bytes.subarray(12, 16))
      const uint24 = (at: number): number => d.getUint8(at) | d.getUint8(at + 1) << 8 | d.getUint8(at + 2) << 16
      if (tag === 'VP8X') { width = uint24(24) + 1; height = uint24(27) + 1 }
      else if (tag === 'VP8 ') { width = d.getUint16(26, true) & 16383; height = d.getUint16(28, true) & 16383 }
      else if (tag === 'VP8L' && bytes[20] === 47) { const bits = d.getUint32(21, true); width = (bits & 16383) + 1; height = ((bits >>> 14) & 16383) + 1 }
    }
  } catch { throw new Error('Image header is incomplete or unsupported.') }
  if (width <= 0 || height <= 0) throw new Error('Image dimensions are missing or unsupported.')
  if (width * height > MAX_OCR_PIXELS || Math.max(width, height) > 16384) throw new Error('Image exceeds 16 million pixels or 16384 pixels per side. Resize it before OCR.')
  return { width, height }
}
export function validateOcrResult(value: unknown): OcrResult {
  const result = value as OcrResult | null
  if (!result || typeof result.text !== 'string' || result.text.length > MAX_OCR_TEXT ||
      !Number.isInteger(result.pages) || result.pages < 1 || result.pages > MAX_OCR_PAGES ||
      !Number.isInteger(result.ocrPages) || result.ocrPages < 0 || result.ocrPages > result.pages ||
      (result.confidence !== undefined && (!Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 100))) throw new Error('Invalid OCR result or text limit exceeded.')
  return { text: result.text, pages: result.pages, ocrPages: result.ocrPages, confidence: result.confidence }
}
// Normalized display-local coordinates; negative OS origins and mixed DPI stay
// outside the renderer contract. A region is confined to one chosen display.
export function pixelRect(value: unknown, width: number, height: number): OcrRect {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) throw new Error('Invalid captured display dimensions.')
  const rect = value as OcrRect | null
  if (!rect || ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0 || rect.x + rect.width > 1.000001 || rect.y + rect.height > 1.000001) throw new Error('Select a region inside one display.')
  const x = Math.floor(rect.x * width), y = Math.floor(rect.y * height)
  const w = Math.min(width - x, Math.ceil((rect.x + rect.width) * width) - x), h = Math.min(height - y, Math.ceil((rect.y + rect.height) * height) - y)
  if (w < 2 || h < 2 || w * h > MAX_OCR_PIXELS) throw new Error('Select a region between 2 pixels and 16 million pixels.')
  return { x, y, width: w, height: h }
}
