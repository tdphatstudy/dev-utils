import { validatePayload } from '@shared/enterprise/schema'
import { reviewContract } from '@shared/enterprise/openapi'
import { reconcileData } from '@shared/enterprise/reconcile'
import { analyzeLogs } from '@shared/enterprise/logs'
import type { AnalysisRequest } from '@shared/enterprise/jobs'

const scope = globalThis as unknown as { onmessage: ((event: MessageEvent<AnalysisRequest>) => void) | null; postMessage: (value: unknown) => void }
scope.onmessage = ({ data }) => {
  try {
    let result: unknown
    switch (data.kind) {
      case 'schema': result = validatePayload(data.input.schema, data.input.payload, data.input.draft); break
      case 'contract': result = reviewContract(data.input.baseline, data.input.target); break
      case 'reconcile': result = reconcileData(data.input.baseline, data.input.target, data.input.key, data.input.ignored); break
      case 'logs': result = analyzeLogs(data.input.input, data.input.fields, data.input.filters); break
      default: throw new Error('Unknown analysis operation.')
    }
    scope.postMessage({ ok: true, result })
  } catch (error) {
    scope.postMessage({ ok: false, error: error instanceof Error ? error.message : 'Analysis failed.' })
  }
}
