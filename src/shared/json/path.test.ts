import { describe, expect, it } from 'vitest'
import { queryJsonPath } from './path'

const sample = {
  name: 'DevUtils',
  items: [{ id: 1 }, { id: 2 }],
  meta: { nested: { flag: true } }
}

describe('queryJsonPath', () => {
  it('root child', () => {
    const r = queryJsonPath(sample, '$.name')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.values).toEqual(['DevUtils'])
  })

  it('array index', () => {
    const r = queryJsonPath(sample, '$.items[0].id')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.values).toEqual([1])
  })

  it('wildcard', () => {
    const r = queryJsonPath(sample, '$.items[*].id')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.values).toEqual([1, 2])
  })

  it('recursive descent', () => {
    const r = queryJsonPath(sample, '$..flag')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.values).toEqual([true])
  })
})
describe('escaped keys and result paths', () => {
  it('supports escaped quotes and Unicode in bracket keys', () => {
    expect(queryJsonPath({ 'a"b': 1 }, '$["a\\"b"]')).toEqual({ ok: true, values: [1], paths: ['$["a\\"b"]'] })
    expect(queryJsonPath({ 'café': 2 }, '$["caf\\u00e9"]')).toEqual({ ok: true, values: [2], paths: ['$["café"]'] })
  })
  it('returns paths that can be queried again for dotted and spaced keys', () => {
    const value = { 'a.b': { 'with space': 3 } }
    const result = queryJsonPath(value, '$["a.b"][*]')
    if (!result.ok) throw new Error(result.error)
    expect(queryJsonPath(value, result.paths[0]!)).toMatchObject({ ok: true, values: [3] })
  })
  it('supports negative array indexes and returns their actual positive path', () => {
    expect(queryJsonPath([1, 2, 3], '$[-1]')).toEqual({ ok: true, values: [3], paths: ['$[2]'] })
  })
})
