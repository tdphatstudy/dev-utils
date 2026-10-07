export const QUICK_TOOLS = [
  { id: 'design.color', name: 'Color Picker' },
  { id: 'text.ocr', name: 'OCR · Image / PDF' },
  { id: 'network.mock-api', name: 'Mock API' },
  { id: 'time.timestamp', name: 'Timestamp Converter' },
  { id: 'json.studio', name: 'JSON Studio' },
  { id: 'base64.codec', name: 'Base64 Encode / Decode' },
  { id: 'security.random', name: 'Secure Random / UUID' },
  { id: 'text.qr', name: 'QR Code' }
] as const

export type QuickToolId = typeof QUICK_TOOLS[number]['id']
export type QuickTarget = QuickToolId | 'home' | 'app.settings'
export function isQuickTarget(value: unknown): value is QuickTarget {
  return value === 'home' || value === 'app.settings' || QUICK_TOOLS.some((tool) => tool.id === value)
}
export function quickTargetPath(target: QuickTarget): string {
  return target === 'home' ? '/' : `/tool/${target}`
}
