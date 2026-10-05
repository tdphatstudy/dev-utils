import { describe, expect, it } from 'vitest'
import QRCode from 'qrcode'
import { decodeQrFromDataUrl, decodeQrFromFile, decodeQrFromImageData, encodeQr } from './index'

describe('QR payload and image boundaries', () => {
  it('reports actual PNG dimensions and exact byte count for Unicode payloads', async () => {
    const result = await encodeQr('Xin chào 👋', { width: 280 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const png = Buffer.from(result.dataUrl.split(',')[1], 'base64')
    expect(png.readUInt32BE(16)).toBe(result.pixelSize)
    expect(png.length).toBe(result.byteLength)
    expect(result.payloadBytes).toBe(new TextEncoder().encode(result.text).length)
    expect(result.version).toBeGreaterThan(0)
  })

  it('rejects invalid options, excessive content, and undersized dense QR', async () => {
    for (const options of [{ width: 0 }, { width: 300.5 }, { margin: -1 }, { scale: Infinity }]) {
      expect((await encodeQr('hello', options)).ok).toBe(false)
    }
    expect((await encodeQr('x'.repeat(7090))).ok).toBe(false)
    const small = await encodeQr('x'.repeat(500), { width: 32, errorCorrectionLevel: 'H' })
    expect(small.ok).toBe(false)
    if (!small.ok) expect(small.error).toContain('at least')
    expect((await encodeQr('x'.repeat(3000), { errorCorrectionLevel: 'H' })).ok).toBe(false)
  })

  it('round trips real raster modules, including Unicode and exact whitespace', async () => {
    const text = '  Wi-Fi: mật khẩu 🔒\n'
    const qr = QRCode.create(text)
    const side = (qr.modules.size + 8) * 8
    const data = new Uint8ClampedArray(side * side * 4).fill(255)
    for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
      const mx = Math.floor(x / 8) - 4, my = Math.floor(y / 8) - 4
      if (mx >= 0 && my >= 0 && mx < qr.modules.size && my < qr.modules.size && qr.modules.get(my, mx)) {
        const offset = (y * side + x) * 4
        data[offset] = data[offset + 1] = data[offset + 2] = 0
      }
    }
    const result = await decodeQrFromImageData({ data, width: side, height: side } as ImageData)
    expect(result.ok && result.text).toBe(text)
    expect((await decodeQrFromImageData({ data: new Uint8ClampedArray(4), width: 2, height: 2 } as ImageData)).ok).toBe(false)
  })

  it('refuses external image URLs and oversized files before accessing browser APIs', async () => {
    for (const source of ['https://example.com/qr.png', 'file:///qr.png', 'data:image/svg+xml;base64,AAAA']) {
      expect((await decodeQrFromDataUrl(source)).ok).toBe(false)
    }
    expect((await decodeQrFromFile({ size: 33 * 1024 * 1024 } as File)).ok).toBe(false)
  })
})
