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
