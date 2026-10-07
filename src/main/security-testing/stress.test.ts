import { performance } from 'node:perf_hooks'
import { setTimeout as delay } from 'node:timers/promises'
import { expect, it } from 'vitest'
import type { StressInput } from '@shared/security-testing/types'
import { runStress, TEST_TOTAL_BYTES } from './stress'
const input: StressInput = { request: { method: 'GET', url: 'http://127.0.0.1:3000', headers: {} }, count: 6, rate: 50, concurrency: 2, durationSeconds: 2 }
const response = { status: 200, headers: {}, bytes: 5, truncated: false, timeMs: 85 }
it('paces starts without catch-up bursts, caps concurrency and reports response/error percentiles', async () => {
  const starts: number[] = []; let active = 0, peak = 0
  const result = await runStress(input, 'job', new AbortController().signal, () => {}, async (_request, signal) => {
    const index = starts.length; starts.push(performance.now()); peak = Math.max(peak, ++active)
    await delay(85, undefined, { signal }); active--
    if (index === 2) throw new Error('private-network-detail')
    return { ...response, status: index === 3 ? 503 : 200, timeMs: 10 + index * 10 }
  })
  expect(peak).toBe(2)
  expect(starts.slice(1).every((value, index) => value - starts[index] >= 19.5)).toBe(true)
  expect(result).toMatchObject({ state: 'completed', started: 6, completed: 5, successful: 4, httpErrors: 1, networkErrors: 1, active: 0, statuses: { 200: 4, 503: 1 }, latency: { samples: 5, p50: 40, p95: 60, p99: 60 } })
  expect(JSON.stringify(result)).not.toContain('private')
})
it('stops scheduling, aborts in-flight requests and drains before returning Stop metrics', async () => {
  const controller = new AbortController()
  const result = await runStress(input, 'job', controller.signal, value => { if (value.started >= 2) controller.abort() }, async (_request, signal) => { await delay(1500, undefined, { signal }); return response })
  expect(result).toMatchObject({ state: 'stopped', started: 2, cancelled: 2, completed: 0, active: 0 })
})
it('starts nothing for an already cancelled job', async () => {
  const controller = new AbortController(); controller.abort()
  expect(await runStress(input, 'job', controller.signal, () => {})).toMatchObject({ state: 'stopped', started: 0 })
})
it('enforces the duration cap when the transport waits for cancellation', async () => {
  const result = await runStress({ ...input, durationSeconds: 1 }, 'job', new AbortController().signal, () => {}, async (_request, signal) => { await delay(5000, undefined, { signal }); return response })
  expect(result).toMatchObject({ state: 'duration-limit', started: 2, cancelled: 2, active: 0 })
})
it('enforces the aggregate byte budget without retaining response bodies', async () => {
  const result = await runStress(input, 'job', new AbortController().signal, () => {}, async () => ({ ...response, bytes: TEST_TOTAL_BYTES, truncated: true }))
  expect(result).toMatchObject({ state: 'byte-limit', started: 1, truncated: 1, bytes: TEST_TOTAL_BYTES })
})
