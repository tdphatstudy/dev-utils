import { buildRegExp, replaceRegex, splitRegex, testRegex } from './index'
export interface RegexJob {
  mode: 'test' | 'replace' | 'split' | 'explain' | 'cheatsheet'
  pattern: string
  flags: string
  text: string
  replacement: string
  splitLimit: number
}
export type RegexJobResult = {
  tested?: ReturnType<typeof testRegex>
  replaced?: ReturnType<typeof replaceRegex>
  split?: ReturnType<typeof splitRegex>
  error?: string
  durationMs: number
}
// Run only inside a terminable worker: input bounds cannot prevent backtracking.
export function executeRegexJob(job: RegexJob): RegexJobResult {
  const start = performance.now()
  if (job.pattern.length > 16384 || job.text.length > 1_000_000 || job.replacement.length > 100_000) {
    return { error: 'Limit: pattern 16,384, test string 1,000,000 and replacement 100,000 UTF-16 units.', durationMs: 0 }
  }
  let result: Omit<RegexJobResult, 'durationMs'>
  switch (job.mode) {
    case 'test': result = { tested: testRegex(job.pattern, job.flags, job.text, 1000) }; break
    case 'replace': {
      const replaced = replaceRegex(job.pattern, job.flags, job.text, job.replacement)
      result = replaced.ok && replaced.result.length > 5_000_000 ? { error: 'Replacement exceeds 5,000,000 UTF-16 units. Reduce the input or replacement.' } : { replaced }
      break
    }
    case 'split':
      if (!Number.isInteger(job.splitLimit) || job.splitLimit < 0 || job.splitLimit > 1000) result = { error: 'Split limit must be an integer from 0 to 1000 (0 uses the 1000-part display cap).' }
      else {
        const split = splitRegex(job.pattern, job.flags, job.text, job.splitLimit || 1001)
        result = split.ok && split.parts.length > 1000 ? { error: 'More than 1000 split parts. Set a limit or narrow the pattern.' } : { split }
      }
      break
    default: {
      const compiled = buildRegExp(job.pattern, job.flags)
      result = compiled.ok ? {} : { error: compiled.error }
    }
  }
  return { ...result, durationMs: performance.now() - start }
}
