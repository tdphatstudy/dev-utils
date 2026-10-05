import { expect, it } from 'vitest'
import { executeRegexJob, type RegexJob } from './job'
const base: RegexJob = { mode: 'test', pattern: 'a', flags: 'g', text: 'aaa', replacement: '#', splitLimit: 0 }
it('executes only the requested operation', () => {
  expect(executeRegexJob(base)).toMatchObject({ tested: { ok: true, matchCount: 3 } })
  expect(executeRegexJob({ ...base, mode: 'replace', flags: '' })).toMatchObject({ replaced: { result: '#aa', count: 1 } })
  expect(executeRegexJob({ ...base, mode: 'explain' })).not.toHaveProperty('tested')
})
it('bounds displays and rejects invalid numeric limits instead of silently coercing them', () => {
  const many = executeRegexJob({ ...base, text: 'a'.repeat(1001) })
  expect(many.tested?.ok).toBe(false)
  expect(executeRegexJob({ ...base, mode: 'split', pattern: ',', text: 'a,'.repeat(1001) }).error).toContain('1000')
  expect(executeRegexJob({ ...base, mode: 'split', splitLimit: 1.5 }).error).toContain('integer')
  expect(executeRegexJob({ ...base, text: 'a'.repeat(1_000_001) }).error).toContain('Limit')
})
