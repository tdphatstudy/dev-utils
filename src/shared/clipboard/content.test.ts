import { expect, it } from 'vitest'
import { classifyClip, sensitiveClip, transformClip } from './content'
import { validateClipboardPreferences, DEFAULT_CLIPBOARD } from './types'
it('detects credential assignments, connection strings, keys and likely passwords without blocking ordinary code', () => {
  for (const value of ['password=hunter2', 'Authorization: Bearer abc.def', '-----BEGIN RSA PRIVATE KEY-----', 'postgres://alice:secret@localhost/db', 'ghp_' + 'a'.repeat(25), 'ComplexPassword123!']) expect(sensitiveClip(value)).toBe(true)
  for (const value of ['hello world', '{"count":9007199254740993}', '#007aff', 'https://example.com/path?q=a', '9fdd03f0-a6fb-42c1-bafe-bc7bfe9e33b8']) expect(sensitiveClip(value)).toBe(false)
  expect(sensitiveClip('Project INTERNAL ticket', ['internal'])).toBe(true)
})
it('classifies content and preserves JSON lexemes, duplicate keys and string spaces through transformations', () => {
  expect(classifyClip('#abc')).toBe('color'); expect(classifyClip('https://example.com')).toBe('url'); expect(classifyClip('{"a":1}')).toBe('json'); expect(classifyClip('x', true)).toBe('image')
  const json = '{ "a":9007199254740993, "a":1e99, "text":"a b\\n c" }'
  expect(transformClip(json, 'json-minify')).toBe('{"a":9007199254740993,"a":1e99,"text":"a b\\n c"}')
  expect(transformClip(json, 'json-format')).toContain('9007199254740993')
  expect(transformClip('a\r\na\nb', 'lines-unique')).toBe('a\nb')
  const unicode = 'Tiếng Việt 👋'; expect(transformClip(transformClip(unicode, 'base64-encode'), 'base64-decode')).toBe(unicode)
  expect(() => transformClip('{bad}', 'json-format')).toThrow(); expect(() => transformClip('%xx', 'url-decode')).toThrow()
  expect(() => transformClip('é'.repeat(140_000), 'plain')).toThrow('256 KiB')
})
it('bounds and validates preferences instead of accepting arbitrary settings payloads', () => {
  expect(validateClipboardPreferences(DEFAULT_CLIPBOARD)).toEqual(DEFAULT_CLIPBOARD)
  for (const change of [{ enabled: 1 }, { persist: 'true' }, { maxEntries: 301 }, { retentionDays: 0 }, { excludeText: [''] }, { excludeText: Array(21).fill('term') }]) expect(() => validateClipboardPreferences({ ...DEFAULT_CLIPBOARD, ...change })).toThrow()
})
