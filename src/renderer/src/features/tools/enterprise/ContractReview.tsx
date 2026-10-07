import { useI18n } from '@renderer/i18n'
import { SplitPane } from '@renderer/components/ui/SplitPane'
import { useState } from 'react'
import { useAnalysisJob } from '@renderer/hooks/useAnalysisJob'
import { CONTRACT_BASE_EXAMPLE, CONTRACT_TARGET_EXAMPLE } from '@shared/enterprise/examples'
import { AnalysisInput, AnalysisResults, AnalysisShell, AnalysisTable, AnalysisToolbar } from './AnalysisUi'

export default function ContractReview(): JSX.Element {
  const { t } = useI18n()
  const [baseline, setBaseline] = useState(''), [target, setTarget] = useState(''), [fileError, setFileError] = useState<string | null>(null), [severity, setSeverity] = useState('all')
  const job = useAnalysisJob('contract')
  const reset = (): void => { job.invalidate(); setFileError(null) }
  return <AnalysisShell purpose="Review one OpenAPI file, or compare two versions." busy={job.busy} hasResult={Boolean(job.result)} error={fileError || job.error}
    toolbar={<AnalysisToolbar action="Review API contract" busy={job.busy} run={() => job.run({ baseline, target })} cancel={job.cancel} example={() => { reset(); setBaseline(CONTRACT_BASE_EXAMPLE); setTarget(CONTRACT_TARGET_EXAMPLE) }} clear={() => { reset(); setBaseline(''); setTarget('') }} report={job.result ? JSON.stringify(job.result, null, 2) : undefined} />}
    input={<>
    <div className="flex h-[340px] min-h-0 flex-col"><SplitPane flush labels={['Baseline OpenAPI', 'Target OpenAPI (optional)']}><AnalysisInput revision={job.revision} label="Baseline OpenAPI" value={baseline} onChange={value => { reset(); setBaseline(value) }} onError={setFileError} accept=".json,.yaml,.yml" placeholder="Paste OpenAPI 3.0.x or 3.1.x as JSON/YAML" /><AnalysisInput revision={job.revision} label="Target OpenAPI (optional)" value={target} onChange={value => { reset(); setTarget(value) }} onError={setFileError} accept=".json,.yaml,.yml" placeholder="Leave empty to review one contract" /></SplitPane></div>
    </>}
    details={<p className="text-[12px] leading-relaxed text-mac-label-secondary">Compares path operations, parameters, required request bodies, responses and authentication declarations. Schema changes require review; this does not prove complete semantic compatibility or validate the full OAS specification. Only local JSON Pointer refs are expanded; recursive/external refs are refused. Reports contain API paths, IDs and field names; example/default values are omitted.</p>}>
    {job.result && <><AnalysisResults title="Contract findings" summary={t('{operations} operations · {breaking} breaking · {review} review · {info} informational', { operations: job.result.operations.length, ...job.result.counts })}>
      <label className="flex flex-wrap items-center gap-2 text-[13px]">{t('Show findings')}<select aria-label={t('Show findings')} className="mac-input !w-auto" value={severity} onChange={event => setSeverity(event.target.value)}><option value="all">{t('All severities')}</option><option value="breaking">{t('Breaking')}</option><option value="review">{t('Review')}</option><option value="info">{t('Informational')}</option></select></label>
      <AnalysisTable headers={['Severity', 'Operation', 'Finding']} caption="Contract review findings" rows={job.result.findings.filter(finding => severity === 'all' || finding.severity === severity).map(finding => [t(({ breaking: 'Breaking', review: 'Review', info: 'Informational' } as Record<string, string>)[finding.severity]), finding.operation, finding.detail])} />
      {!job.result.findings.length && <p className="text-[13px]">No findings from these checks. Review the coverage limits before releasing.</p>}{job.result.truncated && <p className="text-[12px]">Showing the first 1,000 findings.</p>}
    </AnalysisResults><AnalysisResults title="Operation inventory" summary="Target operations when comparing; baseline operations otherwise."><AnalysisTable headers={['Operation', 'Operation ID', 'Authentication', 'Responses']} caption="OpenAPI operation inventory" rows={job.result.operations.slice(0, 1000).map(operation => [operation.operation, operation.operationId || t('Not declared'), t(operation.secured ? 'Required by contract' : 'Optional / not declared'), operation.responses])} /></AnalysisResults></>}

  </AnalysisShell>
}
