import { describe, expect, it } from 'vitest'
import { generateLorem, loremWordCount, type LoremOptions } from './index'

const options: LoremOptions = { unit: 'paragraphs', count: 3, wordsPerSentence: 12, sentencesPerParagraph: 4, startWithLorem: true }

describe('Lorem text generation', () => {
  it('produces exact paragraph, sentence and word counts', () => {
    const text = generateLorem(options, () => 0.5)
    expect(text.startsWith('Lorem ipsum dolor sit amet consectetur adipiscing elit')).toBe(true)
    expect(text.split('\n\n')).toHaveLength(3)
    expect(text.match(/\./g)).toHaveLength(12)
    expect(text.split(/\s+/)).toHaveLength(144)
    expect(loremWordCount(options)).toBe(144)
  })
  it('respects words and sentences independently of unused sizing options', () => {
    expect(generateLorem({ ...options, unit: 'words', count: 1 }, () => 0)).toBe('Lorem')
    expect(generateLorem({ ...options, unit: 'words', count: 1, wordsPerSentence: NaN, sentencesPerParagraph: 0 }, () => 0)).toBe('Lorem')
    const text = generateLorem({ ...options, unit: 'sentences', count: 2, wordsPerSentence: 1, startWithLorem: false }, () => 0)
    expect(text).toBe('Lorem. Ipsum.')
  })
  it('can regenerate cosmetic text without changing the requested sizes', () => {
    expect(generateLorem(options, () => 0.1)).not.toEqual(generateLorem(options, () => 0.9))
    expect(generateLorem({ ...options, unit: 'words', count: 10_000 }, () => 0).split(' ')).toHaveLength(10_000)
  })
  it.each([
    { count: 0 }, { count: 1.5 }, { count: NaN }, { count: 10_001 },
    { wordsPerSentence: 101 }, { sentencesPerParagraph: 21 },
    { count: 200, wordsPerSentence: 100, sentencesPerParagraph: 20 }
  ])('rejects invalid or excessive work: %j', (change) => {
    expect(() => generateLorem({ ...options, ...change })).toThrow()
  })
})
