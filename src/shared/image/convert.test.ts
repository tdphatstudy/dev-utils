import { describe, expect, it } from 'vitest'
import { clampQuality, computeTargetSize, extForFormat, mimeForFormat } from './convert'

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
})
