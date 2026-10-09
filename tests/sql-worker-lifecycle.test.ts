import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { startSqlJob, SQL_JOB_TIMEOUT_MS, type SqlWorker } from '../src/shared/sql/job'
import type { SqlResult } from '../src/shared/sql'

const job = { kind: 'validate' as const, input: 'SELECT 1', options: { dialect: 'mysql' as const } }
const fixture = (): SqlWorker => ({ onmessage: null, onerror: null, postMessage: vi.fn(), terminate: vi.fn() })
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

it('terminates a completed SQL worker and clears its deadline', () => {
  const worker = fixture(), complete = vi.fn()
  startSqlJob(job, () => worker, complete)
  expect(worker.postMessage).toHaveBeenCalledWith(job)
  worker.onmessage!({ data: { ok: true, text: '' } } as MessageEvent<SqlResult>)
  expect(worker.terminate).toHaveBeenCalledOnce()
  expect(complete).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})

it('cancels obsolete SQL workers without publishing late results', () => {
  const first = fixture(), next = fixture(), complete = vi.fn()
  const cancel = startSqlJob(job, () => first, complete)
  const lateMessage = first.onmessage!
  cancel()
  startSqlJob({ ...job, input: 'SELECT 2' }, () => next, complete)
  lateMessage({ data: { ok: true, text: 'obsolete result' } } as MessageEvent<SqlResult>)
  expect(complete).not.toHaveBeenCalled()
  expect(first.terminate).toHaveBeenCalledOnce()
  next.onmessage!({ data: { ok: true, text: 'SELECT 2' } } as MessageEvent<SqlResult>)
  expect(complete).toHaveBeenCalledWith({ ok: true, text: 'SELECT 2' })
})

it('enforces a five second deadline and ignores subsequent worker messages', async () => {
  const worker = fixture(), complete = vi.fn()
  startSqlJob(job, () => worker, complete)
  const lateMessage = worker.onmessage!
  await vi.advanceTimersByTimeAsync(SQL_JOB_TIMEOUT_MS)
  expect(worker.terminate).toHaveBeenCalledOnce()
  expect(complete).toHaveBeenCalledWith({ ok: false, error: expect.stringContaining('5 seconds') })
  lateMessage({ data: { ok: true, text: '' } } as MessageEvent<SqlResult>)
  expect(complete).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})

it('reports startup and execution failures and releases all resources', () => {
  const complete = vi.fn(), worker = fixture()
  startSqlJob(job, () => { throw new Error('worker unavailable') }, complete)
  expect(complete).toHaveBeenCalledWith({ ok: false, error: expect.stringContaining('Could not start') })
  startSqlJob(job, () => worker, complete)
  worker.onerror!({} as ErrorEvent)
  expect(worker.terminate).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})
