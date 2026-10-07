import { useCallback, useEffect, useRef, useState } from 'react'
import type { AnalysisInputs, AnalysisKind, AnalysisResults } from '@shared/enterprise/jobs'

export function useAnalysisJob<K extends AnalysisKind>(kind: K): {
  result: AnalysisResults[K] | null; error: string | null; busy: boolean; revision: number
  run: (input: AnalysisInputs[K]) => void; invalidate: () => void; cancel: () => void
} {
  const [result, setResult] = useState<AnalysisResults[K] | null>(null), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const current = useRef<{ worker: Worker; timer: ReturnType<typeof setTimeout> } | null>(null)
  const stop = useCallback(() => {
    if (!current.current) return
    current.current.worker.terminate(); clearTimeout(current.current.timer); current.current = null
  }, [])
  useEffect(() => stop, [stop])
  const invalidate = useCallback(() => { stop(); setResult(null); setError(null); setBusy(false); setRevision(value => value + 1) }, [stop])
  const cancel = (): void => { invalidate(); setError('Analysis cancelled. Inputs are still available in this view.') }
  const run = (input: AnalysisInputs[K]): void => {
    invalidate(); setBusy(true)
    try {
      const worker = new Worker(new URL('../workers/enterprise.worker.ts', import.meta.url), { type: 'module' })
      const finish = (): boolean => {
        if (current.current?.worker !== worker) return false
        stop(); setBusy(false); return true
      }
      const timer = setTimeout(() => { if (finish()) setError('Analysis exceeded 5 seconds and was stopped. Reduce the input or simplify recursive/regex constraints.') }, 5000)
      current.current = { worker, timer }
      worker.onmessage = (event: MessageEvent<{ ok: boolean; result?: AnalysisResults[K]; error?: string }>) => {
        if (!finish()) return
        if (event.data.ok && event.data.result) setResult(event.data.result)
        else setError(event.data.error ?? 'Analysis failed.')
      }
      worker.onerror = (event) => { event.preventDefault(); if (finish()) setError('The local analysis worker failed. No data was sent to a server.') }
      worker.postMessage({ kind, input })
    } catch { stop(); setBusy(false); setError('Unable to start the local analysis worker.') }
  }
  return { result, error, busy, revision, run, invalidate, cancel }
}
