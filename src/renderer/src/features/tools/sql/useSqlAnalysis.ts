import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormatSqlOptions, SqlDialectId, SqlResult } from '@shared/sql'
import { startSqlJob, type SqlJob, type SqlWorker } from '@shared/sql/job'
import { MAX_SQL_BYTES } from '@shared/sql/limits'

const createWorker = (): SqlWorker => new Worker(new URL('./sql.worker.ts', import.meta.url), { type: 'module' })

export function useSqlAnalysis(input: string, dialect: SqlDialectId, replace: (text: string) => void): {
  validation: SqlResult | null
  pending: boolean
  actionPending: boolean
  error: string | null
  run: (kind: 'format' | 'minify', options: FormatSqlOptions) => void
  cancel: () => void
  retry: () => void
} {
  const [state, setState] = useState<{ input: string; dialect: SqlDialectId; result: SqlResult } | null>(null)
  const [actionPending, setActionPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [check, setCheck] = useState(0)
  const stop = useRef<() => void>(() => {})
  const revision = useRef(0)
  const current = useRef({ input, dialect })
  current.current = { input, dialect }
  const started = useRef(false)
  const cancel = useCallback(() => {
    revision.current++
    stop.current()
    setActionPending(false)
    setError('SQL processing canceled. Edit the input or run the action again.')
    setState({ ...current.current, result: { ok: false, error: 'SQL processing canceled. Edit the input or run the action again.' } })
  }, [])
  useEffect(() => {
    const version = ++revision.current
    stop.current()
    setActionPending(false)
    setError(null)
    if (input.length > MAX_SQL_BYTES) { setState({ input, dialect, result: { ok: false, error: 'SQL input exceeds 1 MiB. Split it into smaller files.' } }); return }
    if (!input.trim()) { setState({ input, dialect, result: { ok: false, error: 'Empty input' } }); return }
    const delay = setTimeout(() => {
      started.current = true
      stop.current = startSqlJob({ kind: 'validate', input, options: { dialect } }, createWorker, result => {
        if (revision.current === version && current.current.input === input && current.current.dialect === dialect) setState({ input, dialect, result })
      })
    }, started.current ? 200 : 0)
    stop.current = () => clearTimeout(delay)
    return () => { revision.current++; stop.current() }
  }, [input, dialect, check])
  const run = useCallback((kind: 'format' | 'minify', options: FormatSqlOptions): void => {
    stop.current()
    const version = ++revision.current, source = current.current
    setActionPending(true)
    setError(null)
    const job: SqlJob = { kind, input: source.input, options }
    stop.current = startSqlJob(job, createWorker, result => {
      if (revision.current !== version || source.input !== current.current.input || source.dialect !== current.current.dialect) return
      setActionPending(false)
      if (result.ok) replace(result.text)
      else setError(result.error)
    })
  }, [replace])
  const validation = state?.input === input && state.dialect === dialect ? state.result : null
  return { validation, pending: validation === null, actionPending, error, run, cancel, retry: () => { setState(null); setCheck(value => value + 1) } }
}
