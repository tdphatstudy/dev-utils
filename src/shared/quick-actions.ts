import type { QuickWidget } from './quick-tools'
export const QUICK_TOOLS = [
  { id: 'design.color', name: 'Color Picker', widget: 'color' },
  { id: 'text.ocr', name: 'OCR · Image / PDF', widget: 'ocr' },
  { id: 'text.clipboard', name: 'Clipboard Manager', widget: 'clipboard' },
  { id: 'network.mock-api', name: 'Mock API', widget: 'mock' },
  { id: 'time.timestamp', name: 'Timestamp Converter', widget: 'timestamp' },
  { id: 'json.studio', name: 'JSON Studio', widget: 'json' },
  { id: 'base64.codec', name: 'Base64 Encode / Decode', widget: 'base64' },
  { id: 'security.random', name: 'Secure Random / UUID', widget: 'random' },
  { id: 'text.qr', name: 'QR Code', widget: 'qr' }
] as const
export function quickWidgetForTool(value: unknown): QuickWidget | null { return QUICK_TOOLS.find(tool => tool.id === value)?.widget ?? null }

export type QuickToolId = typeof QUICK_TOOLS[number]['id']
export type QuickTarget = QuickToolId | 'home' | 'app.settings'
export function isQuickTarget(value: unknown): value is QuickTarget {
  return value === 'home' || value === 'app.settings' || QUICK_TOOLS.some((tool) => tool.id === value)
}
export function quickTargetPath(target: QuickTarget): string {
  return target === 'home' ? '/' : `/tool/${target}`
}
