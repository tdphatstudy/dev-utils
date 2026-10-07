import { expect, it } from 'vitest'
import { parseResponseHeaders } from './header-input'
import { reviewHeaders } from './review'

it('parses copied status lines and case-insensitive repeated headers without prototype mutations', () => {
  const result = parseResponseHeaders('HTTP/2 200\r\nContent-Security-Policy: default-src \'self\'\r\nX-Test: one:two\r\nx-test: three\r\n__proto__: private\r\n')
  expect(result['x-test']).toBe('one:two, three')
  expect(result.__proto__).toBe('private')
  expect(Object.getPrototypeOf(result)).toBe(null)
  expect(reviewHeaders(result, true).observed).toContain('content-security-policy')
  expect(JSON.stringify(reviewHeaders(result, true))).not.toContain('private')
})
it.each(['', 'HTTP/2 200', ' folded: line', 'content-type: text/plain\nresponse body', 'x: a\0b', 'x: ' + 'a'.repeat(8192), 'x: ' + 'a'.repeat(65536), Array(257).fill('x: y').join('\n')])('rejects empty, invalid and oversized pasted headers', value => {
  expect(() => parseResponseHeaders(value)).toThrow()
})
it('refuses to combine policies from multiple responses or reordered status blocks', () => {
  expect(() => parseResponseHeaders('HTTP/1.1 302 Redirect\nX-Test: one\nHTTP/2 200\nX-Test: two')).toThrow('single response')
  expect(() => parseResponseHeaders('X-Test: one\nHTTP/2 200')).toThrow('single response')
})
