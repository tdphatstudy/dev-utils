import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { planHashCandidates, searchHash, type HashSearchInput } from './hash-search'
const md5 = (text: string): string => createHash('md5').update(text).digest('hex')
const input: HashSearchInput = { algorithm: 'MD5', target: md5('ab'), mode: 'generated', dictionary: '', alphabet: 'ab', minLength: 1, maxLength: 2, maxAttempts: 100, maxSeconds: 10 }
it.each(['MD5', 'SHA-1', 'SHA-256', 'SHA-512'] as const)('finds %s dictionary candidates without trimming or leaking progress', async algorithm => {
  const target = createHash(algorithm.toLowerCase().replace('-', '')).update('  private  ').digest('hex')
  const updates: unknown[] = []
  const result = await searchHash({ ...input, algorithm, target, mode: 'dictionary', dictionary: 'private\n  private  \n  private  ' }, value => updates.push(value))
  expect(result).toMatchObject({ state: 'found', attempted: 2, totalCandidates: '2', match: '  private  ' })
  expect(updates[0]).not.toHaveProperty('match')
})
it('enumerates finite generated candidates in order, including the empty string', async () => {
  expect(await searchHash(input, () => {})).toMatchObject({ state: 'found', match: 'ab', attempted: 4, totalCandidates: '6' })
  expect(await searchHash({ ...input, target: md5(''), minLength: 0 }, () => {})).toMatchObject({ state: 'found', attempted: 1, match: '', totalCandidates: '7' })
})
it('distinguishes exhausted candidates, attempt limit and time limit', async () => {
  expect(await searchHash({ ...input, target: md5('never') }, () => {})).toMatchObject({ state: 'exhausted', attempted: 6 })
  expect(await searchHash({ ...input, maxAttempts: 2 }, () => {})).toMatchObject({ state: 'attempt-limit', attempted: 2 })
  let elapsed = 0
  const result = await searchHash({ ...input, maxSeconds: 1 }, () => {}, async text => { elapsed += 600; return md5(text) }, () => elapsed)
  expect(result).toMatchObject({ state: 'time-limit', attempted: 2 })
})
it.each([{ target: '$2b$12$private' }, { algorithm: 'bcrypt' }, { target: 'g'.repeat(32) }, { alphabet: 'aab' }, { alphabet: 'é' }, { maxLength: 17 }, { minLength: -1 }, { minLength: 3, maxLength: 2 }, { maxAttempts: 10000001 }, { maxSeconds: 601 }, { mode: 'dictionary', dictionary: 'x'.repeat(1025) }])('rejects unsupported hashes or unbounded candidates', async patch => {
  await expect(searchHash({ ...input, ...patch } as HashSearchInput, () => {})).rejects.toThrow()
})
it('counts a huge candidate space without materializing it', async () => {
  const result = await searchHash({ ...input, alphabet: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', minLength: 16, maxLength: 16, maxAttempts: 1 }, () => {})
  expect(result).toMatchObject({ state: 'attempt-limit', attempted: 1, totalCandidates: (62n ** 16n).toString() })
})
it('builds predictable dictionary variations and includes original words with preserved whitespace', async () => {
  const rules = { lowercase: true, uppercase: true, capitalize: true, suffixes: '123\n!\n123' }
  const value = { ...input, mode: 'dictionary' as const, dictionary: 'admin\nadmin\n  word  ', rules, target: md5('Admin!') }
  const plan = planHashCandidates(value)
  const candidates = [...plan.candidates]
  expect(plan.total).toBe(24n)
  expect(candidates.slice(0, 3)).toEqual(['admin', 'admin123', 'admin!'])
  expect(candidates).toContain('  word  ')
  expect(await searchHash(value, () => {})).toMatchObject({ state: 'found', match: 'Admin!', attempted: 12 })
})
it('supports long explicit candidates and keeps preview bounded without revealing a match', async () => {
  const words = Array.from({ length: 20 }, (_, index) => `word${index}`)
  const result = await searchHash({ ...input, mode: 'dictionary', dictionary: words.join('\n'), target: md5('word19'), showCandidates: true }, () => {})
  expect(result.recentCandidates).toEqual(words.slice(13, 19))
  expect(result.recentCandidates).not.toContain(result.match)
  expect(await searchHash({ ...input, mode: 'dictionary', dictionary: 'x'.repeat(1024), target: md5('x'.repeat(1024)) }, () => {})).toMatchObject({ state: 'found', attempted: 1 })
})
it('only includes plaintext samples when enabled and throttles real progress updates', async () => {
  let clock = 0
  const updates: unknown[] = []
  const result = await searchHash({ ...input, target: md5('never') }, value => updates.push(value), async word => { clock += 100; return md5(word) }, () => clock)
  expect(result).not.toHaveProperty('recentCandidates')
  expect(updates).toHaveLength(4)
})
it.each([{ lowercase: 'yes', uppercase: false, capitalize: false, suffixes: '' }, { lowercase: false, uppercase: false, capitalize: false, suffixes: Array.from({ length: 17 }, (_, index) => String(index)).join('\n') }, { lowercase: false, uppercase: false, capitalize: false, suffixes: 'x'.repeat(33) }])('rejects malformed or unbounded variation rules', async rules => {
  await expect(searchHash({ ...input, mode: 'dictionary', dictionary: 'admin', rules } as HashSearchInput, () => {})).rejects.toThrow()
})
