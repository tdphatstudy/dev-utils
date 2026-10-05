/**
 * QR encode / decode helpers (browser + Electron renderer).
 * Encode: qrcode · Decode: jsqr
 */

export type QrErrorLevel = 'L' | 'M' | 'Q' | 'H'
export const QR_MAX_FILE_BYTES = 32 * 1024 * 1024
export const QR_MAX_PIXELS = 16_000_000

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
  | { ok: true; dataUrl: string; text: string; byteLength: number; pixelSize: number; version: number; payloadBytes: number }
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
  const payloadBytes = new TextEncoder().encode(value).length
  if (payloadBytes > 7089) return { ok: false, error: 'Payload exceeds QR capacity (maximum 7,089 numeric characters; Unicode and higher ECC allow less).' }
  const margin = options.margin ?? 4
  const scale = options.scale ?? 8
  if (!Number.isInteger(margin) || margin < 0 || margin > 16) return { ok: false, error: 'Margin must be an integer from 0 to 16 modules.' }
  if (!Number.isInteger(scale) || scale < 1 || scale > 32) return { ok: false, error: 'Scale must be an integer from 1 to 32.' }
  if (options.width !== undefined && (!Number.isInteger(options.width) || options.width < 32 || options.width > 2048)) return { ok: false, error: 'Image size must be an integer from 32 to 2048 px.' }
  if (!['L', 'M', 'Q', 'H'].includes(options.errorCorrectionLevel ?? 'M')) return { ok: false, error: 'Invalid error correction level.' }

  try {
    // Dynamic import keeps main bundle lighter when tool not opened
    const QRCode = (await import('qrcode')).default
    const qr = QRCode.create(value, { errorCorrectionLevel: options.errorCorrectionLevel ?? 'M' })
    const modules = qr.modules.size + 2 * margin
    if (options.width !== undefined && options.width < modules) return { ok: false, error: `This QR needs at least ${modules}px. Increase size or shorten the payload.` }
    const dataUrl = await QRCode.toDataURL(value, {
      errorCorrectionLevel: options.errorCorrectionLevel ?? 'M',
      margin,
      scale,
      width: options.width,
      color: {
        dark: options.dark ?? '#000000',
        light: options.light ?? '#ffffff'
      }
    })
    // estimate size from base64
    const b64 = dataUrl.split(',')[1] ?? ''
    const byteLength = Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0)
    return { ok: true, dataUrl, text: value, byteLength, payloadBytes, version: qr.version, pixelSize: options.width ?? modules * scale }
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
    if (!Number.isInteger(imageData.width) || !Number.isInteger(imageData.height) || imageData.width < 1 || imageData.height < 1 || imageData.width * imageData.height > QR_MAX_PIXELS || imageData.data.length !== imageData.width * imageData.height * 4) return { ok: false, error: 'Invalid image data or image exceeds 16 megapixels.' }
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

    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w * h > QR_MAX_PIXELS) return { ok: false, error: 'Invalid image dimensions or image exceeds 16 megapixels.' }

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
  if (file.size === 0 || file.size > QR_MAX_FILE_BYTES) return { ok: false, error: 'Choose a nonempty image up to 32 MiB.' }
  if (!file.type.startsWith('image/') && !/\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name)) {
    return { ok: false, error: 'File must be an image' }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    return await decodeQrFromSource(img)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not read image' }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function decodeQrFromDataUrl(dataUrl: string): Promise<QrDecodeResult> {
  if (!dataUrl.trim()) return { ok: false, error: 'Empty image data' }
  if (!/^data:image\/(?:png|jpeg|webp|gif|bmp);base64,[A-Za-z0-9+/]*={0,2}$/i.test(dataUrl.trim()) || dataUrl.length > 45_000_000) return { ok: false, error: 'Use a local base64 raster image data URL (up to 32 MiB).' }
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
    const timer = setTimeout(() => {
      img.onload = img.onerror = null
      img.src = ''
      reject(new Error('Image loading timed out. Try a smaller image.'))
    }, 10_000)
    img.onload = () => { clearTimeout(timer); resolve(img) }
    img.onerror = () => { clearTimeout(timer); reject(new Error('Could not load image')) }
    img.src = src
  })
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.click()
}
