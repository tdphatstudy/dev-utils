/**
 * QR encode / decode helpers (browser + Electron renderer).
 * Encode: qrcode · Decode: jsqr
 */

export type QrErrorLevel = 'L' | 'M' | 'Q' | 'H'

export interface QrEncodeOptions {
  errorCorrectionLevel?: QrErrorLevel
  /** Module size scale for PNG (default 8) */
  scale?: number
  margin?: number
  dark?: string
  light?: string
  width?: number
}

export type QrEncodeResult =
  | { ok: true; dataUrl: string; text: string; byteLength: number }
  | { ok: false; error: string }

export type QrDecodeResult =
  | {
      ok: true
      text: string
      version: number
      /** Approximate location of finder pattern corners */
      location?: {
        topLeft: { x: number; y: number }
        topRight: { x: number; y: number }
        bottomLeft: { x: number; y: number }
        bottomRight: { x: number; y: number }
      }
    }
  | { ok: false; error: string }

export async function encodeQr(
  text: string,
  options: QrEncodeOptions = {}
): Promise<QrEncodeResult> {
  const value = text
  if (!value) return { ok: false, error: 'Text is empty' }

  try {
    // Dynamic import keeps main bundle lighter when tool not opened
    const QRCode = (await import('qrcode')).default
    const dataUrl = await QRCode.toDataURL(value, {
      errorCorrectionLevel: options.errorCorrectionLevel ?? 'M',
      margin: options.margin ?? 2,
      scale: options.scale ?? 8,
      width: options.width,
      color: {
        dark: options.dark ?? '#000000',
        light: options.light ?? '#ffffff'
      }
    })
    // estimate size from base64
    const b64 = dataUrl.split(',')[1] ?? ''
    const byteLength = Math.floor((b64.length * 3) / 4)
    return { ok: true, dataUrl, text: value, byteLength }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Failed to encode QR'
    }
  }
}

export async function decodeQrFromImageData(
  imageData: ImageData
): Promise<QrDecodeResult> {
  try {
    const jsQR = (await import('jsqr')).default
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'attemptBoth'
    })
    if (!code) return { ok: false, error: 'No QR code found in image' }
    return {
      ok: true,
      text: code.data,
      version: code.version,
      location: {
        topLeft: code.location.topLeftCorner,
        topRight: code.location.topRightCorner,
        bottomLeft: code.location.bottomLeftCorner,
        bottomRight: code.location.bottomRightCorner
      }
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Failed to decode QR'
    }
  }
}

/** Decode from HTMLImageElement, HTMLCanvasElement, or ImageBitmap */
export async function decodeQrFromSource(
  source: CanvasImageSource,
  width?: number,
  height?: number
): Promise<QrDecodeResult> {
  try {
    const canvas = document.createElement('canvas')
    const w =
      width ??
      (source instanceof HTMLVideoElement
        ? source.videoWidth
        : source instanceof HTMLImageElement
          ? source.naturalWidth || source.width
          : (source as HTMLCanvasElement).width)
    const h =
      height ??
      (source instanceof HTMLVideoElement
        ? source.videoHeight
        : source instanceof HTMLImageElement
          ? source.naturalHeight || source.height
          : (source as HTMLCanvasElement).height)

    if (!w || !h) return { ok: false, error: 'Invalid image dimensions' }

    // Cap decode size for performance
    const maxSide = 1600
    const scale = Math.min(1, maxSide / Math.max(w, h))
    canvas.width = Math.max(1, Math.round(w * scale))
    canvas.height = Math.max(1, Math.round(h * scale))
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return { ok: false, error: 'Canvas not available' }
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    return decodeQrFromImageData(imageData)
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Failed to read image'
    }
  }
}

export async function decodeQrFromFile(file: File): Promise<QrDecodeResult> {
  if (!file.type.startsWith('image/') && !/\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name)) {
    return { ok: false, error: 'File must be an image' }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    return await decodeQrFromSource(img)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function decodeQrFromDataUrl(dataUrl: string): Promise<QrDecodeResult> {
  if (!dataUrl.trim()) return { ok: false, error: 'Empty image data' }
  try {
    const img = await loadImage(dataUrl.trim())
    return await decodeQrFromSource(img)
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Invalid image data URL'
    }
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image'))
    img.src = src
  })
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.click()
}
