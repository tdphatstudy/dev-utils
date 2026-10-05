export interface ColorValue {
  hex: string
  rgb: string
  hsl: string
  hsv: string
  r: number
  g: number
  b: number
  foreground: '#000000' | '#FFFFFF'
  contrast: number
}
export type ScreenColorResult = { hex: string } | null

export function normalizeHex(input: string): string | null {
  const value = input.trim().replace(/^#/, '')
  if (!/^(?:[a-f0-9]{3}|[a-f0-9]{6})$/i.test(value)) return null
  return `#${(value.length === 3 ? [...value].map((char) => char + char).join('') : value).toUpperCase()}`
}

export function colorFromHex(input: string): ColorValue | null {
  const hex = normalizeHex(input)
  if (!hex) return null
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  const channels = [r, g, b].map((channel) => channel / 255)
  const [red, green, blue] = channels
  const max = Math.max(...channels), min = Math.min(...channels), delta = max - min
  const lightness = (max + min) / 2
  let hue = 0
  if (delta) {
    hue = max === red ? ((green - blue) / delta) % 6 : max === green ? (blue - red) / delta + 2 : (red - green) / delta + 4
    hue = (hue * 60 + 360) % 360
  }
  const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0
  const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
  const black = (luminance + 0.05) / 0.05, white = 1.05 / (luminance + 0.05)
  return {
    hex, r, g, b,
    rgb: `rgb(${r}, ${g}, ${b})`,
    hsl: `hsl(${Math.round(hue)}, ${Math.round(saturation * 100)}%, ${Math.round(lightness * 100)}%)`,
    hsv: `hsv(${Math.round(hue)}, ${Math.round((max ? delta / max : 0) * 100)}%, ${Math.round(max * 100)}%)`,
    foreground: black >= white ? '#000000' : '#FFFFFF',
    contrast: Math.max(black, white)
  }
}
