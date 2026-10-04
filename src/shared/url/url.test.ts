import { describe, expect, it } from 'vitest'
import { parseUrl, encodeUri, decodeUri } from './index'

describe('URL tools', () => {
  it('preserves duplicate query keys, special object keys and decoded Unicode', () => {
    const result = parseUrl('https://example.com/?__proto__=a&__proto__=b&constructor=c&q=%E2%9C%93')
    expect(result.ok).toBe(true)
    if (result.ok) expect(JSON.parse(JSON.stringify(result.value.query))).toEqual({ ['__proto__']: ['a', 'b'], constructor: ['c'], q: ['✓'] })
  })
  it('distinguishes literal plus signs from form spaces', () => {
    expect(decodeUri('a+b%2Bc', 'component')).toEqual({ ok: true, text: 'a+b+c' })
    expect(decodeUri('a+b%2Bc', 'form')).toEqual({ ok: true, text: 'a b+c' })
  })
  it.each(['component', 'url', 'form'] as const)('roundtrips %s encoding', (mode) => {
    const text = mode === 'url' ? 'https://example.com/đường?q=hi there#ok' : "hello + world/✓ !'()~"
    const result = encodeUri(text, mode)
    if (!result.ok) throw new Error(result.error)
    expect(decodeUri(result.text, mode)).toEqual({ ok: true, text })
  })
  it('reports malformed Unicode and escape sequences without throwing', () => {
    expect(encodeUri('\ud800', 'component').ok).toBe(false)
    expect(decodeUri('%GG', 'component').ok).toBe(false)
    expect(decodeUri('%C0%AF', 'component').ok).toBe(false)
  })
})
