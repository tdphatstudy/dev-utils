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

  it('advances zero-width Unicode matches by code point and sticky alone matches once', () => {
    const result = testRegex('(?:)', 'gu', '😀a')
    expect(result.ok && result.matches.map((match) => match.index)).toEqual([0, 2, 3])
    const sticky = testRegex('a', 'y', 'aaa')
    expect(sticky.ok && sticky.matchCount).toBe(1)
    const globalSticky = testRegex('a', 'gy', 'aa aa')
    expect(globalSticky.ok && globalSticky.matchCount).toBe(2)
  })

  it('accepts empty ECMAScript expressions and rejects bad flags instead of changing them', () => {
    expect(testRegex('', '', 'a').ok).toBe(true)
    for (const flags of ['gg', 'x', 'G', 'uv']) expect(testRegex('a', flags, 'a').ok).toBe(false)
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

  it('reports actual non-global replacement count and preserves native dollar semantics', () => {
    expect(replaceRegex('a', '', 'aaa', '#')).toEqual({ ok: true, result: '#aa', count: 1 })
    const replacements = ['$$ $& $` $\' $1 $2 $3 $01 $12 $00', '$<word>/$<missing>/$<__proto__>', '$1x$2', '']
    for (const pattern of ['(?<word>a)(b)?', '(a)(b)?', '(?<__proto__>a)(b)?', '(?:)']) {
      for (const flags of ['', 'g', 'y', 'gu']) for (const replacement of replacements) {
        const text = 'aa ab😀'
        const result = replaceRegex(pattern, flags, text, replacement)
        expect(result.ok && result.result).toBe(text.replace(new RegExp(pattern, flags), replacement))
      }
    }
  })

  it('bounds expansion before constructing an amplified result', () => {
    const result = replaceRegex('a', 'g', 'a'.repeat(500), '$\''.repeat(1000))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('5,000,000')
  })

  it('preserves explicit zero split limit and unmatched captures', () => {
    expect(splitRegex(',', '', 'a,b', 0)).toEqual({ ok: true, parts: [] })
    expect(splitRegex('(,)|;', '', 'a;b')).toEqual({ ok: true, parts: ['a', undefined, 'b'] })
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

  it('explains named groups without losing their prefix', () => {
    expect(explainRegex('(?<word>a)')[0]).toMatchObject({ raw: '(?<word>', kind: 'group', meaning: 'Named group "word"' })
  })
})
