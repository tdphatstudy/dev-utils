import { describe, expect, it } from 'vitest'
import { diffLines } from './line-diff'

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
