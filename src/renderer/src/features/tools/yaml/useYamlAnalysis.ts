import { useEffect, useRef, useState } from 'react'
import type { YamlAnalysis } from '@shared/yaml'

export function useYamlAnalysis(input: string): { analysis: YamlAnalysis | null; pending: boolean } {
  const [state, setState] = useState<{ input: string; analysis: YamlAnalysis } | null>(null)
  const started = useRef(false)
  useEffect(() => {
    let done = false, worker: Worker | undefined, deadline: ReturnType<typeof setTimeout> | undefined
    const stop = (): void => { worker?.terminate(); if (deadline) clearTimeout(deadline) }
    const finish = (analysis: YamlAnalysis): void => {
      if (done) return
      done = true; stop(); setState({ input, analysis })
    }
    const fail = (error: string): void => {
      const issue = { ok: false as const, error }
      finish({ parsed: issue, formatted: issue, asJson: issue })
    }
    // First mount has nothing to debounce. Keep the typing debounce after a
    // job starts; a restored draft still cancels the initial timer via cleanup.
    const delay = setTimeout(() => {
      if (done) return
      started.current = true
      try {
        worker = new Worker(new URL('./yaml.worker.ts', import.meta.url), { type: 'module' })
        worker.onmessage = (event: MessageEvent<YamlAnalysis>) => finish(event.data)
        worker.onerror = () => fail('Could not process YAML. Reopen the tool and retry.')
        deadline = setTimeout(() => fail('YAML processing exceeded 5 seconds. Split the document or simplify aliases.'), 5000)
        worker.postMessage(input)
      } catch { fail('YAML worker unavailable. Reopen the tool and retry.') }
    }, started.current ? 200 : 0)
    return () => { done = true; clearTimeout(delay); stop() }
  }, [input])
  const analysis = state?.input === input ? state.analysis : null
  return { analysis, pending: analysis === null }
}
