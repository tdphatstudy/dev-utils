export type LoremUnit = 'words' | 'sentences' | 'paragraphs'

export interface LoremOptions {
  unit: LoremUnit
  count: number
  wordsPerSentence: number
  sentencesPerParagraph: number
  startWithLorem: boolean
}

export const LOREM_MAX_WORDS = 10_000
const WORDS = ('lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum integer posuere erat a ante venenatis dapibus posuere velit aliquet praesent commodo cursus magna vel scelerisque nisl consectetur et donec ullamcorper nulla non metus auctor fringilla maecenas sed diam eget risus varius blandit sit amet non magna cras mattis consectetur purus sit amet fermentum curabitur blandit tempus porttitor aenean lacinia bibendum nulla sed consectetur').split(' ')

export function loremWordCount(options: LoremOptions): number {
  if (!['words', 'sentences', 'paragraphs'].includes(options.unit)) throw new Error('Choose words, sentences or paragraphs.')
  if (!Number.isInteger(options.count) || options.count < 1 || options.count > LOREM_MAX_WORDS) throw new Error('Count must be a whole number from 1 to 10,000.')
  if (options.unit !== 'words' && (!Number.isInteger(options.wordsPerSentence) || options.wordsPerSentence < 1 || options.wordsPerSentence > 100)) throw new Error('Words per sentence must be from 1 to 100.')
  if (options.unit === 'paragraphs' && (!Number.isInteger(options.sentencesPerParagraph) || options.sentencesPerParagraph < 1 || options.sentencesPerParagraph > 20)) throw new Error('Sentences per paragraph must be from 1 to 20.')
  const words = options.count * (options.unit === 'words' ? 1 : options.wordsPerSentence) * (options.unit === 'paragraphs' ? options.sentencesPerParagraph : 1)
  if (words > LOREM_MAX_WORDS) throw new Error('This selection exceeds 10,000 words. Reduce the count or paragraph size.')
  return words
}

/** Placeholder text only. Randomness is cosmetic and never used for secrets. */
export function generateLorem(options: LoremOptions, random: () => number = Math.random): string {
  const total = loremWordCount(options)
  const sample = random()
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) throw new Error('Random sample must be from 0 (inclusive) to 1 (exclusive).')
  const offset = Math.floor(sample * WORDS.length)
  const words = Array.from({ length: total }, (_, i) => options.startWithLorem && i < 8 ? WORDS[i] : WORDS[(offset + i) % WORDS.length])
  if (options.unit === 'words') {
    if (options.startWithLorem) words[0] = 'Lorem'
    return words.join(' ')
  }
  const sentences: string[] = []
  for (let i = 0; i < words.length; i += options.wordsPerSentence) {
    const sentence = words.slice(i, i + options.wordsPerSentence).join(' ')
    sentences.push(sentence[0].toUpperCase() + sentence.slice(1) + '.')
  }
  if (options.unit === 'sentences') return sentences.join(' ')
  const paragraphs: string[] = []
  for (let i = 0; i < sentences.length; i += options.sentencesPerParagraph) paragraphs.push(sentences.slice(i, i + options.sentencesPerParagraph).join(' '))
  return paragraphs.join('\n\n')
}
