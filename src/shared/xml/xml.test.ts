import { describe, expect, it } from 'vitest'
import { formatXml, minifyXml, validateXml } from './index'

const SAMPLE = `<?xml version="1.0"?><root><item id="1">hi</item><item id="2"/></root>`

describe('xml', () => {
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
