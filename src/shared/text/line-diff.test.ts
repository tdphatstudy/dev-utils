import { describe, expect, it } from 'vitest'
import { diffLines, lineDiffReport } from './line-diff'

describe('diffLines', () => {
  it('detects identical', () => {
    const r = diffLines('a\nb', 'a\nb')
    expect(r.added).toBe(0)
    expect(r.removed).toBe(0)
    expect(r.unchanged).toBe(2)
  })

  it('detects added and removed', () => {
    const r = diffLines('a\nb\nc', 'a\nx\nc')
    expect(r.removed).toBe(1)
    expect(r.added).toBe(1)
    expect(r.unchanged).toBe(2)
  })

  it('handles pure insert', () => {
    const r = diffLines('a', 'a\nb')
    expect(r.added).toBe(1)
    expect(r.unchanged).toBe(1)
  })
})
describe('large line comparisons and reports', () => {
  it('bounds large comparisons while retaining both input documents', () => {
    const a = Array.from({ length: 3000 }, (_, i) => `line ${i}`)
    const b = [...a]
    b[1500] = 'changed'
    const result = diffLines(a.join('\n'), b.join('\n'))
    expect(result.coarse).toBe(true)
    expect(result.added).toBe(1)
    expect(result.removed).toBe(1)
    expect(result.pairs.flatMap((p) => p.left ? [p.left.text] : [])).toEqual(a)
    expect(result.pairs.flatMap((p) => p.right ? [p.right.text] : [])).toEqual(b)
  })
  it('copies added and removed lines in a comparison report', () => {
    expect(lineDiffReport(diffLines('old', 'new'))).toContain('-old\n+new')
  })
})
