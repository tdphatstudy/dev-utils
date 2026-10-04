import { describe, expect, it } from 'vitest'
import { formatXml, minifyXml, validateXml } from './index'

const SAMPLE = `<?xml version="1.0"?><root><item id="1">hi</item><item id="2"/></root>`

describe('xml', () => {
  it.each([formatXml, minifyXml])('preserves mixed text, whitespace-only leaves, CDATA and xml:space', (transform) => {
    const src = '<root><p>Hello <b>world</b> !</p><space>  </space><raw><![CDATA[ a > b\n  keep ]]></raw><pre xml:space="preserve">\n <x/>  \n</pre></root>'
    const result = transform(src)
    if (!result.ok) throw new Error(result.error)
    for (const part of ['<p>Hello <b>world</b> !</p>', '<space>  </space>', '<raw><![CDATA[ a > b\n  keep ]]></raw>', '<pre xml:space="preserve">\n <x/>  \n</pre>']) expect(result.text).toContain(part)
  })
  it('handles quoted >, Unicode names, BOM and internal DOCTYPE subsets', () => {
    const src = '\ufeff<!DOCTYPE root [<!-- ] > --> <!ENTITY x "a>b">]><root><tên value="a > b" other=\'c > d\'/></root>'
    const result = formatXml(src)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.text.startsWith('\ufeff')).toBe(true)
      expect(result.text).toContain('<!DOCTYPE root [<!-- ] > --> <!ENTITY x "a>b">]>')
      expect(result.text).toContain('<tên value="a > b" other=\'c > d\'/>')
      expect(formatXml(result.text)).toEqual(result)
    }
  })
  it('locates mismatched closing tags across CRLF input', () => {
    expect(validateXml('<root>\r\n  <child></root>')).toMatchObject({ ok: false, line: 2, column: 10, offset: 17, error: expect.stringContaining('Mismatched') })
  })
  it.each(['<a/><b/>', 'hello<a/>', '<a/>tail', '<!-- only comment -->', '<a x=1/>', '<a x="1" x="2"/>', '<a x="a<b"/>', '<a></a extra>', '<a><!-- bad--comment --></a>', '<a><?pi></a>', '<a/><!DOCTYPE a>', '<![CDATA[x]]><a/>', '<a>]]></a>'])('rejects malformed structure/attributes: %s', (input) => {
    expect(validateXml(input).ok).toBe(false)
    expect(formatXml(input).ok).toBe(false)
  })
  it('validates well-formed xml', () => {
    const r = validateXml(SAMPLE)
    expect(r.ok).toBe(true)
  })

  it('rejects mismatched tags', () => {
    const r = validateXml('<a><b></a></b>')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Mismatched/i)
  })

  it('rejects unclosed tags', () => {
    const r = validateXml('<root><child>')
    expect(r.ok).toBe(false)
  })

  it('formats with indent', () => {
    const r = formatXml(SAMPLE, { indent: 2 })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.text).toContain('<root>')
      expect(r.text).toMatch(/\n {2}<item/)
    }
  })

  it('minifies', () => {
    const pretty = formatXml(SAMPLE, { indent: 2 })
    expect(pretty.ok).toBe(true)
    if (!pretty.ok) return
    const mini = minifyXml(pretty.text)
    expect(mini.ok).toBe(true)
    if (mini.ok) {
      expect(mini.text.includes('\n')).toBe(false)
      expect(mini.text).toContain('<root>')
    }
  })
})
