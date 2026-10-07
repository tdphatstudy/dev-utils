import { hashText, type TextHashAlgorithm } from '../crypto/hash'

export interface CandidateRules { lowercase: boolean; uppercase: boolean; capitalize: boolean; suffixes: string }
export interface HashSearchInput { algorithm: TextHashAlgorithm; target: string; mode: 'dictionary' | 'generated'; dictionary: string; alphabet: string; minLength: number; maxLength: number; maxAttempts: number; maxSeconds: number; rules?: CandidateRules; showCandidates?: boolean }
export interface HashSearchProgress { attempted: number; elapsedMs: number; candidatesPerSecond: number; totalCandidates: string; state: 'running' | 'found' | 'exhausted' | 'attempt-limit' | 'time-limit' | 'stopped'; match?: string; recentCandidates?: string[] }
export const HASH_LENGTHS = { MD5: 32, 'SHA-1': 40, 'SHA-256': 64, 'SHA-512': 128 } as const

/** A bounded, lazy plan. Rule combinations may repeat candidates across base words. */
export function planHashCandidates(input: Pick<HashSearchInput, 'mode' | 'dictionary' | 'alphabet' | 'minLength' | 'maxLength' | 'rules'>): { total: bigint; candidates: Iterable<string> } {
  let total = 0n, candidates: Iterable<string>
  if (input.mode === 'dictionary') {
    if (typeof input.dictionary !== 'string' || input.dictionary.length > 1024 * 1024) throw new Error('Dictionary limit: 1 Mi characters.')
    const lines = input.dictionary.split(/\r?\n/)
    if (lines.length > 100000 || lines.some(line => line.length > 1024)) throw new Error('Dictionary limit: 100,000 lines, 1,024 characters each.')
    const words = [...new Set(lines)] // an empty line is an explicit empty-string candidate
    const rules = input.rules
    if (rules && (typeof rules.lowercase !== 'boolean' || typeof rules.uppercase !== 'boolean' || typeof rules.capitalize !== 'boolean' || typeof rules.suffixes !== 'string' || rules.suffixes.length > 512)) throw new Error('Invalid candidate rules.')
    const suffixes = [...new Set(['', ...(rules?.suffixes ? rules.suffixes.split(/\r?\n/) : [])])]
    if (suffixes.length > 17 || suffixes.some(value => value.length > 32)) throw new Error('Use up to 16 suffixes, 32 characters each.')
    const transforms = [(value: string): string => value]
    if (rules?.lowercase) transforms.push(value => value.toLowerCase())
    if (rules?.uppercase) transforms.push(value => value.toUpperCase())
    if (rules?.capitalize) transforms.push(value => value.charAt(0).toUpperCase() + value.slice(1).toLowerCase())
    total = BigInt(words.length * transforms.length * suffixes.length)
    candidates = (function* (): Generator<string> { for (const word of words) for (const transform of transforms) for (const suffix of suffixes) yield transform(word) + suffix })()
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
  return { total, candidates }
}

export async function searchHash(input: HashSearchInput, progress: (value: HashSearchProgress) => void, digest = hashText, now = (): number => performance.now()): Promise<HashSearchProgress> {
  if (!Object.hasOwn(HASH_LENGTHS, input.algorithm) || typeof input.target !== 'string' || !new RegExp(`^[a-f0-9]{${HASH_LENGTHS[input.algorithm]}}$`, 'i').test(input.target.trim())) throw new Error('Provide a hexadecimal digest of the selected algorithm, without salt or prefixes.')
  if (!Number.isInteger(input.maxAttempts) || input.maxAttempts < 1 || input.maxAttempts > 10000000 || !Number.isInteger(input.maxSeconds) || input.maxSeconds < 1 || input.maxSeconds > 600) throw new Error('Search budget: 1–10,000,000 candidates and 1–600 seconds.')
  if (input.showCandidates !== undefined && typeof input.showCandidates !== 'boolean') throw new Error('Invalid candidate preview setting.')
  const target = input.target.trim().toLowerCase(), { total, candidates } = planHashCandidates(input)
  const start = now(); let attempted = 0, lastProgress = start
  const recentCandidates: string[] = []
  const snapshot = (state: HashSearchProgress['state'], match?: string): HashSearchProgress => {
    const elapsedMs = now() - start
    return { state, attempted, elapsedMs, candidatesPerSecond: attempted / Math.max(.001, elapsedMs / 1000), totalCandidates: total.toString(), ...(match !== undefined ? { match } : {}), ...(input.showCandidates ? { recentCandidates: [...recentCandidates] } : {}) }
  }
  progress(snapshot('running'))
  for (const candidate of candidates) {
    if (attempted >= input.maxAttempts) { const result = snapshot('attempt-limit'); progress(result); return result }
    if (now() - start >= input.maxSeconds * 1000) { const result = snapshot('time-limit'); progress(result); return result }
    const hash = await digest(candidate, input.algorithm); attempted++
    if (hash === target) { const result = snapshot('found', candidate); progress(result); return result }
    if (input.showCandidates) { recentCandidates.push(candidate); if (recentCandidates.length > 6) recentCandidates.shift() }
    if (now() - lastProgress >= 250) { lastProgress = now(); progress(snapshot('running')) }
  }
  const result = snapshot('exhausted'); progress(result); return result
}
