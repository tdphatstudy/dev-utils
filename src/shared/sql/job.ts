import type { FormatSqlOptions, SqlResult } from './index'

export interface SqlJob {
  kind: 'validate' | 'format' | 'minify'
  input: string
  options: FormatSqlOptions
}

export interface SqlWorker {
  onmessage: ((event: MessageEvent<SqlResult>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  postMessage(job: SqlJob): void
  terminate(): void
}

export const SQL_JOB_TIMEOUT_MS = 5000

export function startSqlJob(job: SqlJob, createWorker: () => SqlWorker, complete: (result: SqlResult) => void): () => void {
  let worker: SqlWorker | undefined, deadline: ReturnType<typeof setTimeout> | undefined, done = false
  const stop = (): void => {
    if (done) return
    done = true
    clearTimeout(deadline)
    if (worker) { worker.onmessage = null; worker.onerror = null; worker.terminate() }
  }
  const finish = (result: SqlResult): void => { if (done) return; stop(); complete(result) }
  try {
    worker = createWorker()
    worker.onmessage = event => finish(event.data)
    worker.onerror = () => finish({ ok: false, error: 'Could not process SQL. Run again or reopen the tool.' })
    deadline = setTimeout(() => finish({ ok: false, error: 'SQL processing exceeded 5 seconds and was stopped. Simplify the query or split the file.' }), SQL_JOB_TIMEOUT_MS)
    worker.postMessage(job)
  } catch { finish({ ok: false, error: 'Could not start SQL processing. Reopen the tool and retry.' }) }
  return stop
}
