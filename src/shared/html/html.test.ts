import { describe, expect, it } from 'vitest'
import { formatHtml, minifyHtml, validateHtml } from './index'

const SAMPLE = `<!DOCTYPE html><html><head><title>Hi</title></head><body><h1>Hello</h1><p>World<br></p></body></html>`

describe('html', () => {
  it.each([formatHtml, minifyHtml])('preserves inline spacing and raw content exactly', (transform) => {
    const src = '<div><p>Hello <strong>world</strong> !</p><script>\n const x = "> <";\n if (a < b) { x(); }\n</script><pre>\n a   b\n <b>hi</b>\n</pre><textarea>\n  keep\n</textarea></div>'
    const result = transform(src)
    if (!result.ok) throw new Error(result.error)
    for (const part of ['<p>Hello <strong>world</strong> !</p>', '<script>\n const x = "> <";\n if (a < b) { x(); }\n</script>', '<pre>\n a   b\n <b>hi</b>\n</pre>', '<textarea>\n  keep\n</textarea>']) expect(result.text).toContain(part)
  })
  it.each(['<span>a</span> <span>b</span>', 'hello <b>world</b>!', '<ul><li>first<li>second</ul>', '<div style="white-space: pre-wrap">\n <section/>  \n</div>'])('keeps significant spacing or omitted end tags in %s', (input) => {
    expect(minifyHtml(input)).toEqual({ ok: true, text: input })
  })
  it('respects quoted >, raw closing-tag boundaries and literal less-than text', () => {
    const src = '<div data-x="a > b"><p>1 < 2</p><script>const x = "</scriptx>";</script></div>'
    expect(formatHtml(src).ok).toBe(true)
    const result = minifyHtml(src)
    if (result.ok) expect(result.text).toContain('<script>const x = "</scriptx>";</script>')
  })
  it('locates closing mismatches instead of silently closing required children', () => {
    expect(validateHtml('<div>\n  <strong>x</div>')).toMatchObject({ ok: false, line: 2, column: 12, error: expect.stringContaining('</strong>') })
    expect(validateHtml('<div>')).toMatchObject({ ok: false, line: 1, column: 1, hint: expect.stringContaining('</div>') })
  })
  it('validates simple html', () => {
    const r = validateHtml(SAMPLE)
    expect(r.ok).toBe(true)
  })

  it('formats with indent', () => {
    const r = formatHtml(SAMPLE, { indent: 2 })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.text).toMatch(/<!DOCTYPE html>/i)
      expect(r.text).toMatch(/\n {2}<head>/i)
    }
  })

  it('minifies', () => {
    const pretty = formatHtml(SAMPLE, { indent: 2 })
    expect(pretty.ok).toBe(true)
    if (!pretty.ok) return
    const mini = minifyHtml(pretty.text)
    expect(mini.ok).toBe(true)
    if (mini.ok) {
      expect(mini.text).toContain('<h1>')
      expect(mini.text.length).toBeLessThan(pretty.text.length)
    }
  })

  it('preserves script content', () => {
    const src = `<div><script>if (a < b) { x = 1 }</script></div>`
    const r = formatHtml(src, { indent: 2 })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.text).toContain('if (a < b)')
  })
})
