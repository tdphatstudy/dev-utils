import { MOCK_LIMITS } from './types'

/** Parse an HTTP origin-form target without URL normalization or forgiving decoding. */
export function parseMockTarget(target: string): { path: string; query: Record<string, string[]> } {
  if (typeof target !== 'string' || !target.startsWith('/') || target.startsWith('//') ||
    target.length > MOCK_LIMITS.targetLength || /[\x00-\x20\x7f\\]/.test(target) || target.includes('#')) {
    throw new Error('Invalid request URL. Use a local path with properly encoded values.')
  }
  const separator = target.indexOf('?')
  const path = separator < 0 ? target : target.slice(0, separator)
  const search = separator < 0 ? '' : target.slice(separator + 1)
  try {
    // Preserve encoded segments, including dot segments. The matcher decodes
    // once and refuses dot traversal and encoded slashes instead of normalizing.
    for (const segment of path.split('/')) {
      if (/[\x00-\x1f\x7f\\]/.test(decodeURIComponent(segment))) throw new Error('Invalid path')
    }
    const query: Record<string, string[]> = Object.create(null)
    for (const part of search ? search.split('&') : []) {
      const separator = part.indexOf('=')
      const key = decodeURIComponent((separator < 0 ? part : part.slice(0, separator)).replace(/\+/g, ' '))
      const value = decodeURIComponent((separator < 0 ? '' : part.slice(separator + 1)).replace(/\+/g, ' '))
      if (/[\x00-\x1f\x7f]/.test(key + value)) throw new Error('Invalid query')
      ;(query[key] ??= []).push(value)
    }
    return { path, query }
  } catch {
    // Do not reflect raw URLs, which can contain access tokens or other secrets.
    throw new Error('Invalid URL encoding. Use valid UTF-8 percent escapes without control characters.')
  }
}
