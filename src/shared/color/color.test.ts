import { describe, expect, it } from 'vitest'
import { colorFromHex, normalizeHex } from './index'

describe('local colors', () => {
  it('normalizes 3/6 digit HEX and refuses alpha, injected CSS and malformed input', () => {
    expect(normalizeHex(' #f80 ')).toBe('#FF8800')
    expect(normalizeHex('a0b1c2')).toBe('#A0B1C2')
    for (const input of ['#GG0000', '#1234', '#12345678', 'red', '#000;background:red', '']) expect(colorFromHex(input)).toBeNull()
  })
  it('converts primary colors and achromatic values without NaN', () => {
    expect(colorFromHex('#F00')).toMatchObject({ hex: '#FF0000', rgb: 'rgb(255, 0, 0)', hsl: 'hsl(0, 100%, 50%)' })
    expect(colorFromHex('#0F0')?.hsl).toBe('hsl(120, 100%, 50%)')
    expect(colorFromHex('#00F')?.hsl).toBe('hsl(240, 100%, 50%)')
    expect(colorFromHex('#808080')?.hsl).toBe('hsl(0, 0%, 50%)')
    expect(colorFromHex('#808080')?.hsv).toBe('hsv(0, 0%, 50%)')
    expect(colorFromHex('#F80')?.hsv).toBe('hsv(32, 100%, 100%)')
  })
  it('uses the higher contrast foreground, including exact black/white extrema', () => {
    expect(colorFromHex('#000')).toMatchObject({ foreground: '#FFFFFF', contrast: 21 })
    expect(colorFromHex('#fff')).toMatchObject({ foreground: '#000000', contrast: 21 })
    for (const hex of ['#6366f1', '#FF8800', '#999999']) expect(colorFromHex(hex)!.contrast).toBeGreaterThan(4.5)
  })
})
