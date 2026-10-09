import { describe, expect, it } from 'vitest'
import { fingerprint } from './fingerprint'

describe('clipboard fingerprint', () => {
  it('frames formats and optional fields without serializing content', () => {
    const input = { text: 'one', html: '<p>one</p>', png: 'AAAA', toJSON: () => { throw new Error('Unexpected serialization') } }
    expect(fingerprint(input)).toBe(fingerprint({ text: input.text, html: input.html, png: input.png }))
    const values = [{ text: 'ab', html: 'c' }, { text: 'a', html: 'bc' }, { text: 'abc' }, { text: 'abc', html: '' }, { text: 'abc', png: '' }, { text: 'abc', html: '', png: '' }]
    expect(new Set(values.map(fingerprint)).size).toBe(values.length)
  })
  it('preserves exact UTF-16 text identity including surrogate code units', () => {
    const values = ['a', 'a\u0000', '\ud800', '\ud801', '\ufffd', '😀']
    expect(new Set(values.map(text => fingerprint({ text }))).size).toBe(values.length)
    expect(fingerprint({ text: 'a', html: '\ud800' })).not.toBe(fingerprint({ text: 'a', html: '\ud801' }))
  })
})
