import { describe, expect, it } from 'vitest'
import {
  generatePassword,
  generateUuidV4,
  randomBytes,
  randomHex,
  randomInt,
  estimatePasswordEntropy,
  passwordAlphabetSize
} from './random'

describe('CSPRNG', () => {
  it('supports random buffers above the Web Crypto per-call limit', () => {
    expect(randomBytes(70_000)).toHaveLength(70_000)
  })
  it('rejects fractional and nonfinite generator parameters', () => {
    for (const length of [NaN, Infinity, 4.5]) expect(() => generatePassword({ length })).toThrow()
    for (const max of [NaN, Infinity, 2.5]) expect(() => randomInt(max)).toThrow()
    expect(() => generatePassword({ length: 8, lower: false, upper: false, digits: false, symbols: false })).toThrow(/Select/)
  })
  it('keeps the alphabet estimate finite for long passwords', () => {
    expect(passwordAlphabetSize({ lower: true, upper: true, digits: true, symbols: true })).toBe(87)
    expect(estimatePasswordEntropy(256, 87)).toBeCloseTo(256 * Math.log2(87))
  })
  it('randomBytes length', () => {
    expect(randomBytes(16)).toHaveLength(16)
  })

  it('randomHex length', () => {
    expect(randomHex(8)).toHaveLength(16)
  })

  it('randomInt in range', () => {
    for (let i = 0; i < 50; i++) {
      const n = randomInt(10)
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThan(10)
    }
  })

  it('password length and charset', () => {
    const p = generatePassword({
      length: 24,
      lower: true,
      upper: true,
      digits: true,
      symbols: false
    })
    expect(p).toHaveLength(24)
    expect(/[a-z]/.test(p)).toBe(true)
    expect(/[A-Z]/.test(p)).toBe(true)
    expect(/[0-9]/.test(p)).toBe(true)
  })

  it('uuid v4 format', () => {
    const u = generateUuidV4()
    expect(u).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
  })
})
