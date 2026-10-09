import { isSupportedRaster, validateImageSize } from '../image/validation'
export { validateImageSize } from '../image/validation'

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
  const image = isSupportedRaster(b)
  if ((input.kind !== 'pdf' || !pdf) && (input.kind !== 'image' || !image)) throw new Error('Supported files: PNG, JPEG, WebP, GIF, BMP and PDF. The file content must match its type.')
  if (input.kind === 'image') validateImageSize(input.bytes)
  return { bytes: input.bytes, kind: input.kind, language: input.language, forceOcr: input.forceOcr }
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
