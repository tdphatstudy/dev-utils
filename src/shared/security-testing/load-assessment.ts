import type { StressProgress } from './types'

/** A local acceptance check, not a capacity estimate. Cancelled requests are excluded. */
export function assessLoad(value: StressProgress, p95Limit: number, errorPercentLimit: number): { errorPercent: number | null; verdict: 'running' | 'incomplete' | 'pass' | 'fail' } {
  const responses = value.completed + value.networkErrors
  const errorPercent = responses ? (value.completed - value.successful + value.networkErrors) / responses * 100 : null
  if (value.state === 'running') return { errorPercent, verdict: 'running' }
  if (value.state !== 'completed' || value.started !== value.requested || !value.latency.samples || value.latency.p95 === undefined || errorPercent === null || !Number.isFinite(p95Limit) || p95Limit <= 0 || !Number.isFinite(errorPercentLimit) || errorPercentLimit < 0 || errorPercentLimit > 100) return { errorPercent, verdict: 'incomplete' }
  return { errorPercent, verdict: value.latency.p95 <= p95Limit && errorPercent <= errorPercentLimit ? 'pass' : 'fail' }
}
