import { useEffect, useRef, useState } from 'react'
import type { RegexJob, RegexJobResult } from '@shared/regex/job'

export function useRegexJob(job: RegexJob, timeoutMs: number): { result: RegexJobResult | null; pending: boolean; cancel: () => void; rerun: () => void } {
  const [run, setRun] = useState(0)
  const [state, setState] = useState<{ job: RegexJob; run: number; result: RegexJobResult | null }>({ job, run, result: null })
  const cancelRef = useRef<() => void>(() => {})
  const started = useRef(false)
  useEffect(() => {
    let worker: Worker | undefined
    let deadline: ReturnType<typeof setTimeout> | undefined
    let done = false
    const stop = (): void => { worker?.terminate(); if (deadline) clearTimeout(deadline) }
    const finish = (result: RegexJobResult): void => {
      if (done) return
      done = true
      stop()
      setState({ job, run, result })
    }
    setState({ job, run, result: null })
    cancelRef.current = () => finish({ error: 'Canceled. Change an input or click Run to try again.', durationMs: 0 })
    // Start the initial result immediately. Edits remain debounced, and a
    // restored draft invalidates this job before the initial timer runs.
    const delay = setTimeout(() => {
      if (done) return
      started.current = true
      try {
        worker = new Worker(new URL('./regex.worker.ts', import.meta.url), { type: 'module' })
        worker.onmessage = (event: MessageEvent<RegexJobResult>) => finish(event.data)
        worker.onerror = () => finish({ error: 'Regex worker could not start. Click Run to retry.', durationMs: 0 })
        deadline = setTimeout(() => finish({ error: `Time limit (${timeoutMs / 1000}s) reached. Worker stopped; simplify nested quantifiers or reduce the test string, then Run again.`, durationMs: timeoutMs }), timeoutMs)
        worker.postMessage(job)
      } catch (error) { finish({ error: error instanceof Error ? error.message : 'Regex worker unavailable', durationMs: 0 }) }
    }, started.current ? 200 : 0)
    return () => { done = true; clearTimeout(delay); stop(); cancelRef.current = () => {} }
  }, [job, run, timeoutMs])
  const result = state.job === job && state.run === run ? state.result : null
  return { result, pending: result === null, cancel: () => cancelRef.current(), rerun: () => setRun((value) => value + 1) }
}
