import { describe, expect, it } from 'vitest'
import { convertFormat } from './formats'

describe('convertFormat', () => {
  it('json to yaml', () => {
    const r = convertFormat('{"a":1}', 'json', 'yaml')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.text).toContain('a: 1')
    }
  })

  it('yaml to json', () => {
    const r = convertFormat('a: 1\nb: two\n', 'yaml', 'json')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(JSON.parse(r.text)).toEqual({ a: 1, b: 'two' })
    }
  })

  it('same format roundtrip', () => {
    const r = convertFormat('{"x":true}', 'json', 'json')
    expect(r.ok).toBe(true)
    if (r.ok) expect(JSON.parse(r.text)).toEqual({ x: true })
  })

  it('invalid source', () => {
    const r = convertFormat('{', 'json', 'yaml')
    expect(r.ok).toBe(false)
  })
})
