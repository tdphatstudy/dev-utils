import { describe, expect, it } from 'vitest'
import { diffJson, summarizeDiff } from './diff'

describe('diffJson', () => {
  it('detects no diff', () => {
    expect(diffJson({ a: 1 }, { a: 1 })).toEqual([])
  })

  it('detects added and removed', () => {
    const d = diffJson({ a: 1 }, { b: 2 })
    expect(d).toContainEqual({ path: '$.a', kind: 'removed', left: 1 })
    expect(d).toContainEqual({ path: '$.b', kind: 'added', right: 2 })
  })

  it('detects changed values', () => {
    const d = diffJson({ a: 1 }, { a: 2 })
    expect(d).toEqual([{ path: '$.a', kind: 'changed', left: 1, right: 2 }])
  })

  it('detects type change', () => {
    const d = diffJson({ a: 1 }, { a: '1' })
    expect(d[0]?.kind).toBe('type')
  })

  it('diffs arrays', () => {
    const d = diffJson([1, 2], [1, 3, 4])
    expect(d.find((e) => e.path === '$[1]')?.kind).toBe('changed')
    expect(d.find((e) => e.path === '$[2]')?.kind).toBe('added')
  })

  it('summarizeDiff counts', () => {
    const s = summarizeDiff(diffJson({ a: 1, b: 2 }, { a: 9, c: 3 }))
    expect(s.changed).toBe(1)
    expect(s.removed).toBe(1)
    expect(s.added).toBe(1)
  })
})
