import { describe, expect, it } from 'vitest'
import { flattenJsonTree, collectExpandablePaths } from './flatten-tree'

describe('flattenJsonTree', () => {
  it('flattens with default open depth', () => {
    const data = { a: { b: 1 }, c: [2, 3] }
    const rows = flattenJsonTree(data, new Set(), { defaultOpenDepth: 2 })
    expect(rows.some((r) => r.path === '$.a')).toBe(true)
    expect(rows.some((r) => r.path === '$.a.b')).toBe(true)
    expect(rows.some((r) => r.path === '$.c[0]')).toBe(true)
  })

  it('respects closed paths', () => {
    const data = { a: { b: 1 } }
    const rows = flattenJsonTree(data, new Set(['__closed__:$']), { defaultOpenDepth: 2 })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.path).toBe('$')
    expect(rows[0]?.isOpen).toBe(false)
  })

  it('collectExpandablePaths', () => {
    const paths = collectExpandablePaths({ a: { b: 1 } }, 2)
    expect(paths).toContain('$')
    expect(paths).toContain('$.a')
  })
})
