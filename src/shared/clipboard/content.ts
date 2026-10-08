import { colorFromHex } from '@shared/color'
import { decodeBase64, encodeBase64 } from '@shared/base64'
import { formatJsonText } from '@shared/json/format-text'
import { parseJson } from '@shared/json'
import { MAX_CLIP_TEXT, type ClipKind } from './types'

export const CLIP_TRANSFORMS = ['plain', 'trim', 'json-format', 'json-minify', 'base64-encode', 'base64-decode', 'url-encode', 'url-decode', 'lines-unique', 'lines-sort'] as const
export type ClipTransform = typeof CLIP_TRANSFORMS[number]

export function sensitiveClip(text: string, excluded: readonly string[] = []): boolean {
  if (excluded.some(term => text.toLowerCase().includes(term.toLowerCase()))) return true
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|authorization)\s*[=:]\s*["']?\S+/i.test(text)) return true
  if (/\b(?:Bearer\s+[\w.+/=-]+|AKIA[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|eyJ[\w-]+\.[\w-]+\.[\w-]+)\b/.test(text)) return true
  if (/[a-z][a-z0-9+.-]*:\/\/[^\s/:]+:[^\s/@]+@/i.test(text)) return true
  // Conservative heuristic, not a promise that every password is recognized.
  return text.length >= 12 && text.length <= 128 && !/\s/.test(text) && /[a-z]/.test(text) && /[A-Z]/.test(text) && /\d/.test(text) && /[^a-zA-Z0-9]/.test(text) && !/^https?:\/\//i.test(text)
}
export function classifyClip(text: string, image = false): ClipKind {
  if (image) return 'image'
  const trimmed = text.trim()
  if (colorFromHex(trimmed)) return 'color'
  if (/^https?:\/\/[^\s]+$/i.test(trimmed)) { try { new URL(trimmed); return 'url' } catch { /* Plain text. */ } }
  if (/^[{[]/.test(trimmed) && parseJson(trimmed).ok) return 'json'
  return 'text'
}
export function transformClip(text: string, mode: ClipTransform): string {
  if (text.length > MAX_CLIP_TEXT || new TextEncoder().encode(text).length > MAX_CLIP_TEXT) throw new Error('Text exceeds 256 KiB.')
  let result: string
  switch (mode) {
    case 'plain': result = text; break
    case 'trim': result = text.trim(); break
    case 'json-format':
    case 'json-minify': {
      if (!parseJson(text).ok) throw new Error('Enter valid JSON before formatting.')
      // Preserve duplicate keys and large integer lexemes; never round-trip through stringify.
      result = formatJsonText(text)
      if (mode === 'json-minify') result = (result.match(/"(?:\\[\s\S]|[^"\\])*"|[^\s"]+/g) ?? []).join('')
      break
    }
    case 'base64-encode': result = encodeBase64(text); break
    case 'base64-decode': { const decoded = decodeBase64(text); if (!decoded.ok) throw new Error(decoded.error); result = decoded.text; break }
    case 'url-encode': result = encodeURIComponent(text); break
    case 'url-decode': result = decodeURIComponent(text); break
    case 'lines-unique': result = [...new Set(text.split(/\r?\n/))].join('\n'); break
    case 'lines-sort': result = text.split(/\r?\n/).sort().join('\n'); break
    default: throw new Error('Choose a supported transformation.')
  }
  if (new TextEncoder().encode(result).length > MAX_CLIP_TEXT) throw new Error('Result exceeds 256 KiB.')
  return result
}
