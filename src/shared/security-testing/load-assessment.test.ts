import { expect, it } from 'vitest'
import type { StressProgress } from './types'
import { assessLoad } from './load-assessment'

const result: StressProgress = { id: 'test', state: 'completed', requested: 100, started: 100, completed: 99, successful: 98, httpErrors: 1, networkErrors: 1, cancelled: 0, active: 0, truncated: 0, bytes: 1, elapsedMs: 1000, startsPerSecond: 1, completionsPerSecond: 1, statuses: { 200: 98, 500: 1 }, latency: { samples: 99, p95: 400 } }
it('assesses p95 and non-2xx/network error percentage with inclusive thresholds', () => {
  expect(assessLoad(result, 400, 2)).toEqual({ errorPercent: 2, verdict: 'pass' })
  expect(assessLoad(result, 399, 2).verdict).toBe('fail')
  expect(assessLoad(result, 500, 1).verdict).toBe('fail')
  expect(assessLoad({ ...result, completed: 98, cancelled: 1, successful: 98 }, 500, 2).errorPercent).toBeCloseTo(100 / 99)
})
it.each(['stopped', 'duration-limit', 'byte-limit'] as const)('never passes a %s partial run', state => {
  expect(assessLoad({ ...result, state }, 500, 5).verdict).toBe('incomplete')
})
it('distinguishes active, invalid and sample-less runs', () => {
  expect(assessLoad({ ...result, state: 'running' }, 500, 5).verdict).toBe('running')
  expect(assessLoad({ ...result, started: 50 }, 500, 5).verdict).toBe('incomplete')
  expect(assessLoad({ ...result, latency: { samples: 0 } }, 500, 5).verdict).toBe('incomplete')
  expect(assessLoad(result, NaN, 5).verdict).toBe('incomplete')
  expect(assessLoad(result, 500, -1).verdict).toBe('incomplete')
})
