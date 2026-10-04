import type { HttpRequestPayload } from './types'
export const HTTP_BODY_LIMIT = 5 * 1024 * 1024
export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const

export function validateHttpPayload(value: unknown): string | null {
  if (!value || typeof value !== 'object') return 'Invalid HTTP request.'
  const payload = value as Partial<HttpRequestPayload>
  if (!HTTP_METHODS.includes(payload.method!)) return 'Unsupported HTTP method.'
  if (typeof payload.url !== 'string' || !payload.url.trim()) return 'Enter a complete http:// or https:// URL.'
  if (payload.url.length > 8192) return 'URL exceeds 8192 characters.'
  try {
    const url = new URL(payload.url)
    if (!['http:', 'https:'].includes(url.protocol)) return 'URL must use http:// or https://.'
    if (url.username || url.password) return 'Use an Authorization header instead of credentials inside the URL.'
  } catch { return 'Invalid URL. Include http:// or https:// and a hostname.' }
  if (!payload.headers || typeof payload.headers !== 'object' || Array.isArray(payload.headers)) return 'Invalid HTTP headers.'
  if (![null, Object.prototype].includes(Object.getPrototypeOf(payload.headers))) return 'HTTP headers must be a plain key/value object.'
  const entries = Object.entries(payload.headers)
  if (entries.length > 200) return 'Maximum 200 request headers.'
  let headerBytes = 0
  for (const [name, content] of entries) {
    if (!/^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(name)) return `Invalid header name: ${name.slice(0, 64)}.`
    if (typeof content !== 'string' || /[\x00-\x08\x0a-\x1f\x7f]/.test(content)) return `Header ${name} must be a single line of text.`
    if (/[^\x00-\xff]/.test(content)) return `Header ${name} contains unsupported Unicode. Encode the value before sending it.`
    if (['content-length', 'transfer-encoding', 'host'].includes(name.toLowerCase())) return `Header ${name} is managed automatically. Remove this row.`
    headerBytes += new TextEncoder().encode(name + content).length
  }
  if (headerBytes > 64 * 1024) return 'Request headers exceed 64 KB.'
  if (payload.body !== undefined && (typeof payload.body !== 'string' || new TextEncoder().encode(payload.body).length > HTTP_BODY_LIMIT)) return 'Request body exceeds 5 MB or is not text.'
  if (payload.body !== undefined && (payload.method === 'GET' || payload.method === 'HEAD')) return `${payload.method} cannot send a body. Choose another method.`
  if (payload.timeoutMs !== undefined && (!Number.isInteger(payload.timeoutMs) || payload.timeoutMs < 1 || payload.timeoutMs > 120000)) return 'Timeout must be 1–120000 milliseconds.'
  return null
}
