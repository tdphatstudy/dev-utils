export interface ImageMeta {
  mime: string
  dataUrl: string
  byteLength: number
  width?: number
  height?: number
}

const MIME_FROM_MAGIC: { magic: number[]; mime: string }[] = [
  { magic: [0xff, 0xd8, 0xff], mime: 'image/jpeg' },
  { magic: [0x89, 0x50, 0x4e, 0x47], mime: 'image/png' },
  { magic: [0x47, 0x49, 0x46, 0x38], mime: 'image/gif' },
  { magic: [0x52, 0x49, 0x46, 0x46], mime: 'image/webp' }
]

export function detectImageMime(bytes: Uint8Array): string | null {
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
  const dataUrlMatch = /^data:([^;]+);base64,(.+)$/i.exec(b64)
  if (dataUrlMatch) b64 = dataUrlMatch[2]!
  b64 = b64.replace(/\s+/g, '')
  const binary = atob(b64)
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

export function imageBytesToDataUrl(bytes: Uint8Array, mime?: string): ImageMeta {
  const detected = mime ?? detectImageMime(bytes) ?? 'application/octet-stream'
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
    let mime: string | undefined
    const dataUrlMatch = /^data:([^;]+);base64,/i.exec(input.trim())
    if (dataUrlMatch) mime = dataUrlMatch[1]
    const bytes = base64ToBytes(input)
    if (bytes.length === 0) return { ok: false, error: 'Empty data' }
    const meta = imageBytesToDataUrl(bytes, mime)
    return { ok: true, meta }
  } catch {
    return { ok: false, error: 'Invalid Base64 image data' }
  }
}
