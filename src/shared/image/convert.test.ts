import { describe, expect, it } from 'vitest'
import { clampQuality, computeTargetSize, extForFormat, mimeForFormat, validateImageResize, coverDrawRect } from './convert'

describe('image convert helpers', () => {
  it('percent resize', () => {
    expect(computeTargetSize(200, 100, { mode: 'percent', percent: 50 })).toEqual({
      width: 100,
      height: 50
    })
  })

  it('max resize keeps aspect', () => {
    expect(computeTargetSize(800, 600, { mode: 'max', maxWidth: 400, maxHeight: 400 })).toEqual({
      width: 400,
      height: 300
    })
  })

  it('exact contain', () => {
    const r = computeTargetSize(800, 600, {
      mode: 'exact',
      width: 200,
      height: 200,
      fit: 'contain'
    })
    expect(r.width).toBe(200)
    expect(r.height).toBe(150)
  })

  it('exact stretch', () => {
    expect(
      computeTargetSize(800, 600, { mode: 'exact', width: 100, height: 50, fit: 'stretch' })
    ).toEqual({ width: 100, height: 50 })
  })

  it('mime and quality', () => {
    expect(mimeForFormat('jpeg')).toBe('image/jpeg')
    expect(extForFormat('jpeg')).toBe('jpg')
    expect(clampQuality(2)).toBe(1)
    expect(clampQuality(0)).toBe(0.05)
  })
  it('rejects invalid inputs and amplified outputs before allocating a canvas', () => {
    for (const percent of [0, 501, NaN, Infinity]) expect(validateImageResize(100, 100, { mode: 'percent', percent })).toContain('Percent')
    expect(validateImageResize(4000, 4000, { mode: 'percent', percent: 500 })).toContain('Output')
    expect(validateImageResize(8193, 2, { mode: 'percent', percent: 100 })).toContain('dimensions')
    for (const width of [0, -1, 1.5, 9000]) expect(validateImageResize(100, 100, { mode: 'exact', width, height: 100 })).toContain('whole pixels')
    expect(validateImageResize(4000, 4000, { mode: 'percent', percent: 100 })).toBeNull()
  })
  it('cover crops centrally while contain has a smaller canvas and max never upscales', () => {
    expect(coverDrawRect(200, 100, 100, 100)).toEqual({ sx: 0, sy: 0, sw: 200, sh: 100, dx: -50, dy: 0, dw: 200, dh: 100 })
    expect(computeTargetSize(200, 100, { mode: 'exact', width: 100, height: 100, fit: 'cover' })).toEqual({ width: 100, height: 100 })
    expect(computeTargetSize(200, 100, { mode: 'max', maxWidth: 1000, maxHeight: 1000 })).toEqual({ width: 200, height: 100 })
  })
})
