import { describe, expect, it } from 'vitest'
import {
  generatePassword,
  generateUuidV4,
  randomBytes,
  randomHex,
  randomInt
} from './random'

describe('CSPRNG', () => {
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
