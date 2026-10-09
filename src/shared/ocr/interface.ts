import type { LocaleId } from '../i18n/locales'

export const OCR_INTERFACE_MESSAGES = [
  'Cancel', 'Close', 'Copy text', 'Extracted text', 'Drag to select text on this display',
  'Drag to select text · Esc cancels', 'Drag a larger region · Esc cancels',
  'Selection failed. Try a smaller region · Esc cancels', 'Screen preview could not load. Cancel and retry.',
  'Text copied.', 'Copy failed. Select the text and copy it manually.',
  '{count} characters · review the text before use', 'No text found. Try a closer or sharper region.',
  'Review the text, then select Copy text.', 'Recognition complete. Closing this window clears the result.',
  'Reading text locally', 'Preparing…', 'OCR progress', 'Nothing is uploaded. Cancel closes the engine and releases its memory.',
  'Preparing text recognition', 'Recognizing text', 'Reading PDF', 'Reading PDF text', 'Page complete',
  '{stage} · page {page} of {total}'
] as const

export type OcrInterfaceMessage = typeof OCR_INTERFACE_MESSAGES[number]
export interface OcrInterface {
  locale: LocaleId
  intl: string
  direction: 'ltr' | 'rtl'
  messages: Record<OcrInterfaceMessage, string>
}

export function ocrText(ui: OcrInterface, message: OcrInterfaceMessage, values: Record<string, string | number> = {}): string {
  return ui.messages[message].replace(/\{(\w+)\}/g, (placeholder, key: string) => values[key] === undefined ? placeholder : String(values[key]))
}
