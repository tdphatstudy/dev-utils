import { describe, expect, it } from 'vitest'
import { formatJson, parseJson } from './index'

describe('parseJson', () => {
  it('parses valid json', () => {
    const r = parseJson('{"a":1}')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toEqual({ a: 1 })
  })

  it('reports invalid json', () => {
    const r = parseJson('{a:}')
    expect(r.ok).toBe(false)
  })
})

describe('formatJson', () => {
  it('keeps __proto__ as data while sorting keys', () => {
    const result = formatJson('{"z":1,"__proto__":{"safe":true},"a":2}', { sortKeys: true })
    expect(result.ok).toBe(true)
    if (result.ok) expect(JSON.parse(result.text!)).toEqual(JSON.parse('{"z":1,"__proto__":{"safe":true},"a":2}'))
  })
  it('beautifies', () => {
    const r = formatJson('{"b":1,"a":2}', { indent: 2, sortKeys: true })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.text).toContain('"a"')
      expect(r.text!.indexOf('"a"')).toBeLessThan(r.text!.indexOf('"b"'))
    }
  })

  it('minifies', () => {
    const r = formatJson('{\n  "a": 1\n}', { minify: true })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.text).toBe('{"a":1}')
  })
})
