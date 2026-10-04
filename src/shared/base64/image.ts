import { decodeBase64Bytes } from './index'

export interface ImageMeta {
  mime: string
  dataUrl: string
  byteLength: number
  width?: number
  height?: number
}

const MIME_FROM_MAGIC: { magic: number[]; mime: string }[] = [
  { magic: [0xff, 0xd8, 0xff], mime: 'image/jpeg' },
  { magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], mime: 'image/png' },
  { magic: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], mime: 'image/gif' },
  { magic: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], mime: 'image/gif' },
  { magic: [0x42, 0x4d], mime: 'image/bmp' },
  { magic: [0, 0, 1, 0], mime: 'image/x-icon' },
  { magic: [0x52, 0x49, 0x46, 0x46], mime: 'image/webp' }
]

export function detectImageMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(4, 8)) === 'ftyp' && ['avif', 'avis'].includes(String.fromCharCode(...bytes.subarray(8, 12)))) return 'image/avif'
  const prefix = new TextDecoder().decode(bytes.subarray(0, 4096)).replace(/^\ufeff/, '').trimStart()
  if (/^(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg(?:\s|>)/i.test(prefix)) return 'image/svg+xml'
  for (const { magic, mime } of MIME_FROM_MAGIC) {
    if (magic.every((b, i) => bytes[i] === b)) {
      if (mime === 'image/webp') {
        if (bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
          return mime
        }
        continue
      }
      return mime
    }
  }
  return null
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function base64ToBytes(input: string): Uint8Array {
  let b64 = input.trim()
  const dataUrlMatch = /^data:([^;]+);base64,([\s\S]*)$/i.exec(b64)
  if (dataUrlMatch) b64 = dataUrlMatch[2]!
  const result = decodeBase64Bytes(b64)
  if (!result.ok) throw new Error(result.error)
  return result.bytes
}

export function imageBytesToDataUrl(bytes: Uint8Array, mime?: string): ImageMeta {
  const detected = detectImageMime(bytes)
  if (!detected) throw new Error('Unsupported image data. Use PNG, JPEG, GIF, WebP, SVG (UTF-8), AVIF, BMP or ICO.')
  if (mime && mime !== detected && !(mime === 'image/jpg' && detected === 'image/jpeg') && !(mime === 'image/vnd.microsoft.icon' && detected === 'image/x-icon')) {
    throw new Error(`Image type mismatch: declared ${mime}, detected ${detected}.`)
  }
  const b64 = bytesToBase64(bytes)
  return {
    mime: detected,
    dataUrl: `data:${detected};base64,${b64}`,
    byteLength: bytes.length
  }
}

export function parseImageBase64(
  input: string
): { ok: true; meta: ImageMeta } | { ok: false; error: string } {
  try {
    if (input.length > 12 * 1024 * 1024) return { ok: false, error: 'Image Base64 exceeds the 12 MB input limit.' }
    let mime: string | undefined
    const dataUrlMatch = /^data:([^;]+);base64,/i.exec(input.trim())
    if (dataUrlMatch) mime = dataUrlMatch[1]
    const bytes = base64ToBytes(input)
    if (bytes.length === 0) return { ok: false, error: 'Empty data' }
    const meta = imageBytesToDataUrl(bytes, mime)
    return { ok: true, meta }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid Base64 image data' }
  }
}
