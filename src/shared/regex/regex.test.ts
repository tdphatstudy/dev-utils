import { describe, expect, it } from 'vitest'
import {
  explainRegex,
  highlightSegments,
  normalizeFlags,
  replaceRegex,
  splitRegex,
  testRegex
} from './index'

describe('testRegex', () => {
  it('finds global matches', () => {
    const r = testRegex('\\d+', 'g', 'a12 b34')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.matchCount).toBe(2)
    expect(r.matches[0]!.match).toBe('12')
    expect(r.matches[1]!.match).toBe('34')
  })

  it('captures named groups', () => {
    const r = testRegex('(?<y>\\d{4})-(?<m>\\d{2})', '', '2024-07')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.matches[0]!.namedGroups.y).toBe('2024')
    expect(r.matches[0]!.namedGroups.m).toBe('07')
  })

  it('returns error on invalid pattern', () => {
    const r = testRegex('(', 'g', 'x')
    expect(r.ok).toBe(false)
  })

  it('handles zero-width safely', () => {
    const r = testRegex('(?=a)', 'g', 'aaa')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.matchCount).toBe(3)
  })
})

describe('replace / split', () => {
  it('replaces globally', () => {
    const r = replaceRegex('\\d+', 'g', 'a1b2', '#')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.result).toBe('a#b#')
    expect(r.count).toBe(2)
  })

  it('splits', () => {
    const r = splitRegex('\\s*,\\s*', 'g', 'a, b,c')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.parts).toEqual(['a', 'b', 'c'])
  })
})

describe('explain & highlight', () => {
  it('tokenizes pattern', () => {
    const t = explainRegex('\\d+')
    expect(t.some((x) => x.raw === '\\d')).toBe(true)
    expect(t.some((x) => x.raw === '+')).toBe(true)
  })

  it('builds highlight segments', () => {
    const r = testRegex('b', 'g', 'abc')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const segs = highlightSegments('abc', r.matches)
    expect(segs.map((s) => s.text).join('')).toBe('abc')
    expect(segs.filter((s) => s.hit)).toHaveLength(1)
  })

  it('normalizes flags', () => {
    expect(normalizeFlags('gGiix')).toBe('gi')
  })
})
