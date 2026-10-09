import { expect, it } from 'vitest'
import { validateRasterImage } from './validation'

it('reads dimensions for each supported raster format without a browser or decoder', () => {
  const png = new Uint8Array(24), pd = new DataView(png.buffer)
  png.set([137, 80, 78, 71, 13, 10, 26, 10]); pd.setUint32(16, 100); pd.setUint32(20, 80)
  const jpeg = new Uint8Array([255, 216, 255, 192, 0, 8, 8, 0, 80, 0, 100, 0])
  const gif = new Uint8Array([71, 73, 70, 56, 57, 97, 100, 0, 80, 0])
  const bmp = new Uint8Array(26), bd = new DataView(bmp.buffer)
  bmp.set([66, 77]); bd.setUint32(14, 40, true); bd.setInt32(18, 100, true); bd.setInt32(22, -80, true)
  const webp = new Uint8Array(30)
  webp.set([82, 73, 70, 70]); webp.set([87, 69, 66, 80, 86, 80, 56, 88], 8); webp[24] = 99; webp[27] = 79
  for (const bytes of [png, jpeg, gif, bmp, webp]) expect(validateRasterImage(bytes)).toEqual({ width: 100, height: 80 })
  expect(() => validateRasterImage(png, 7999)).toThrow('pixels')
  expect(() => validateRasterImage(png, 16_000_000, 99)).toThrow('per side')
})

it('rejects unsupported, spoofed and incomplete content before decoding', () => {
  for (const bytes of [new Uint8Array(), new Uint8Array([137, 80, 78, 71, 0, 0, 0, 0]), new TextEncoder().encode('<svg/>'), new Uint8Array([255, 216, 255])]) {
    expect(() => validateRasterImage(bytes)).toThrow()
  }
})
