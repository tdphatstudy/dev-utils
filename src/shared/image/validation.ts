export const MAX_RASTER_PIXELS = 16_000_000
export const MAX_RASTER_SIDE = 16384

export function isSupportedRaster(bytes: Uint8Array): boolean {
  const starts = (signature: number[]): boolean => signature.every((value, index) => bytes[index] === value)
  return starts([137, 80, 78, 71, 13, 10, 26, 10]) || starts([255, 216, 255]) ||
    starts([71, 73, 70, 56, 55, 97]) || starts([71, 73, 70, 56, 57, 97]) ||
    starts([66, 77]) || starts([82, 73, 70, 70]) && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80
}

export function validateRasterImage(bytes: Uint8Array, maxPixels = MAX_RASTER_PIXELS, maxSide = MAX_RASTER_SIDE): { width: number; height: number } {
  if (!isSupportedRaster(bytes)) throw new Error('Supported raster images: PNG, JPEG, WebP, GIF and BMP. File content must match its type.')
  return validateImageSize(bytes, maxPixels, maxSide)
}

// Inspect dimensions before the browser decoder allocates pixel buffers. These
// headers describe the first frame; animated images are recognized as one frame.
export function validateImageSize(bytes: Uint8Array, maxPixels = MAX_RASTER_PIXELS, maxSide = MAX_RASTER_SIDE): { width: number; height: number } {
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
  if (width * height > maxPixels || Math.max(width, height) > maxSide) throw new Error(`Image exceeds ${maxPixels / 1_000_000} million pixels or ${maxSide} pixels per side. Resize it before processing.`)
  return { width, height }
}
