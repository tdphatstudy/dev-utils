import { expect, it } from 'vitest'
import { validateHttpPayload } from './validation'
const valid = { method: 'GET', url: 'http://localhost:3000/test', headers: {} }
it('accepts local developer endpoints and validates untrusted payloads', () => {
  expect(validateHttpPayload(valid)).toBeNull()
  for (const payload of [null, {}, { ...valid, method: 'TRACE' }, { ...valid, url: 'file:///tmp/file' }, { ...valid, url: 'https://user:pass@example.com' }, { ...valid, headers: { 'bad name': 'value' } }, { ...valid, headers: { X: 'a\nb' } }, { ...valid, headers: { 'Content-Length': '10' } }, { ...valid, body: '{}' }, { ...valid, timeoutMs: -1 }, { ...valid, timeoutMs: Infinity }]) {
    expect(validateHttpPayload(payload)).not.toBeNull()
  }
})
