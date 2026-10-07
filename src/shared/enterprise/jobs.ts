import type { ContractResult } from './openapi'
import type { ReconcileResult } from './reconcile'
import type { SchemaResult, SupportedDraft } from './schema'
import type { LogFields, LogFilters, LogResult } from './logs'

export interface AnalysisInputs {
  schema: { schema: string; payload: string; draft: SupportedDraft }
  contract: { baseline: string; target: string }
  reconcile: { baseline: string; target: string; key: string; ignored: string }
  logs: { input: string; fields: LogFields; filters: LogFilters }
}
export interface AnalysisResults { schema: SchemaResult; contract: ContractResult; reconcile: ReconcileResult; logs: LogResult }
export type AnalysisKind = keyof AnalysisInputs
export type AnalysisRequest = { [K in AnalysisKind]: { kind: K; input: AnalysisInputs[K] } }[AnalysisKind]
