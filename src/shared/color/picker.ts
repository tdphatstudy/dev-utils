import type { ColorValue } from './index'

export const COLOR_FORMATS = ['hex', 'rgb', 'hsl', 'hsv'] as const
export type ColorFormat = typeof COLOR_FORMATS[number]
export type PickerView = { kind: 'overlay'; image: string } | { kind: 'result'; color: ColorValue; error?: string }
export function isColorFormat(value: unknown): value is ColorFormat {
  return COLOR_FORMATS.some((format) => value === format)
}
