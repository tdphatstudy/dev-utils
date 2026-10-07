import { hashText, type TextHashAlgorithm } from '../crypto/hash'

export interface HashSearchInput { algorithm: TextHashAlgorithm; target: string; mode: 'dictionary' | 'generated'; dictionary: string; alphabet: string; minLength: number; maxLength: number; maxAttempts: number; maxSeconds: number }
export interface HashSearchProgress { attempted: number; elapsedMs: number; candidatesPerSecond: number; totalCandidates: string; state: 'running' | 'found' | 'exhausted' | 'attempt-limit' | 'time-limit' | 'stopped'; match?: string }
export const HASH_LENGTHS = { MD5: 32, 'SHA-1': 40, 'SHA-256': 64, 'SHA-512': 128 } as const

export async function searchHash(input: HashSearchInput, progress: (value: HashSearchProgress) => void, digest = hashText, now = (): number => performance.now()): Promise<HashSearchProgress> {
  if (!Object.hasOwn(HASH_LENGTHS, input.algorithm) || typeof input.target !== 'string' || !new RegExp(`^[a-f0-9]{${HASH_LENGTHS[input.algorithm]}}$`, 'i').test(input.target.trim())) throw new Error('Provide a hexadecimal digest of the selected algorithm, without salt or prefixes.')
  if (!Number.isInteger(input.maxAttempts) || input.maxAttempts < 1 || input.maxAttempts > 10000000 || !Number.isInteger(input.maxSeconds) || input.maxSeconds < 1 || input.maxSeconds > 600) throw new Error('Search budget: 1–10,000,000 candidates and 1–600 seconds.')
  const target = input.target.trim().toLowerCase()
  let total = 0n, candidates: Iterable<string>
  if (input.mode === 'dictionary') {
    if (typeof input.dictionary !== 'string' || input.dictionary.length > 1024 * 1024) throw new Error('Dictionary limit: 1 Mi characters.')
    const lines = input.dictionary.split(/\r?\n/)
    if (lines.length > 100000 || lines.some(line => line.length > 128)) throw new Error('Dictionary limit: 100,000 lines, 128 characters each.')
    const words = [...new Set(lines)] // an empty line is an explicit empty-string candidate
    candidates = words; total = BigInt(words.length)
  } else if (input.mode === 'generated') {
    if (!input.alphabet || input.alphabet.length > 64 || !/^[\x20-\x7e]+$/.test(input.alphabet) || new Set(input.alphabet).size !== input.alphabet.length) throw new Error('Alphabet must contain 1–64 distinct printable ASCII characters.')
    if (!Number.isInteger(input.minLength) || !Number.isInteger(input.maxLength) || input.minLength < 0 || input.maxLength < input.minLength || input.maxLength > 16) throw new Error('Generated lengths must be from 0 to 16, with minimum ≤ maximum.')
    for (let length = input.minLength; length <= input.maxLength; length++) total += BigInt(input.alphabet.length) ** BigInt(length)
    candidates = (function* (): Generator<string> {
      for (let length = input.minLength; length <= input.maxLength; length++) {
        if (!length) { yield ''; continue }
        const indices = Array<number>(length).fill(0)
        while (true) {
          yield indices.map(index => input.alphabet[index]).join('')
          let position = length - 1
          while (position >= 0 && ++indices[position] === input.alphabet.length) { indices[position] = 0; position-- }
          if (position < 0) break
        }
      }
    })()
  } else throw new Error('Choose dictionary or generated candidates.')
  const start = now(); let attempted = 0, lastProgress = start
  const snapshot = (state: HashSearchProgress['state'], match?: string): HashSearchProgress => {
    const elapsedMs = now() - start
    return { state, attempted, elapsedMs, candidatesPerSecond: attempted / Math.max(.001, elapsedMs / 1000), totalCandidates: total.toString(), ...(match !== undefined ? { match } : {}) }
  }
  progress(snapshot('running'))
  for (const candidate of candidates) {
    if (attempted >= input.maxAttempts) { const result = snapshot('attempt-limit'); progress(result); return result }
    if (now() - start >= input.maxSeconds * 1000) { const result = snapshot('time-limit'); progress(result); return result }
    const hash = await digest(candidate, input.algorithm); attempted++
    if (hash === target) { const result = snapshot('found', candidate); progress(result); return result }
    if (now() - lastProgress >= 250) { lastProgress = now(); progress(snapshot('running')) }
  }
  const result = snapshot('exhausted'); progress(result); return result
}
