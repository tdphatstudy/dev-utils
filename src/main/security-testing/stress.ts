import { performance } from 'node:perf_hooks'
import { setTimeout as delay } from 'node:timers/promises'
import type { BoundedResponse, StressInput, StressProgress } from '@shared/security-testing/types'
import { checkStress } from '@shared/security-testing/validation'
import { performTestRequest } from './request'

export const TEST_TOTAL_BYTES = 128 * 1024 * 1024
export async function runStress(input: StressInput, id: string, external: AbortSignal, progress: (value: StressProgress) => void, transport = performTestRequest): Promise<StressProgress> {
  checkStress(input)
  const controller = new AbortController(), abort = (): void => controller.abort()
  external.addEventListener('abort', abort, { once: true })
  if (external.aborted) abort()
  let reason: StressProgress['state'] = 'completed'
  const timer = setTimeout(() => { reason = 'duration-limit'; abort() }, input.durationSeconds * 1000)
  const start = performance.now(), active = new Set<Promise<void>>(), latencies: number[] = []
  const metrics = { requested: input.count, started: 0, completed: 0, successful: 0, httpErrors: 0, networkErrors: 0, cancelled: 0, truncated: 0, bytes: 0, statuses: Object.create(null) as Record<string, number> }
  const snapshot = (state: StressProgress['state']): StressProgress => {
    const sorted = [...latencies].sort((a, b) => a - b), elapsedMs = performance.now() - start
    const p = (quantile: number): number | undefined => sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)] : undefined
    return { ...metrics, statuses: { ...metrics.statuses }, id, state, active: active.size, elapsedMs, startsPerSecond: metrics.started / Math.max(.001, elapsedMs / 1000), completionsPerSecond: metrics.completed / Math.max(.001, elapsedMs / 1000), latency: { samples: sorted.length, p50: p(.5), p95: p(.95), p99: p(.99), max: sorted.at(-1) } }
  }
  const ticker = setInterval(() => progress(snapshot('running')), 250)
  let next = start
  try {
    progress(snapshot('running'))
    while (metrics.started < input.count && !controller.signal.aborted) {
      if (active.size >= input.concurrency) { await Promise.race(active); continue }
      while (next > performance.now() && !controller.signal.aborted) {
        try { await delay(Math.ceil(next - performance.now()), undefined, { signal: controller.signal }) } catch { break }
      }
      if (controller.signal.aborted) break
      metrics.started++
      next = performance.now() + 1000 / input.rate // no accumulated catch-up bursts
      let task: Promise<void>
      task = (async () => {
        try {
          const response: BoundedResponse = await transport(input.request, controller.signal)
          metrics.completed++; metrics.bytes += response.bytes; metrics.truncated += Number(response.truncated)
          if (response.status >= 200 && response.status < 300) metrics.successful++
          if (response.status >= 400) metrics.httpErrors++
          metrics.statuses[String(response.status)] = (metrics.statuses[String(response.status)] ?? 0) + 1
          latencies.push(response.timeMs)
          if (metrics.bytes >= TEST_TOTAL_BYTES) { reason = 'byte-limit'; abort() }
        } catch { if (controller.signal.aborted) metrics.cancelled++; else metrics.networkErrors++ }
      })().finally(() => active.delete(task))
      active.add(task)
    }
    await Promise.all(active)
    if (external.aborted && reason === 'completed') reason = 'stopped'
    const result = snapshot(reason); progress(result); return result
  } finally { clearTimeout(timer); clearInterval(ticker); external.removeEventListener('abort', abort) }
}
