import { t as uiText } from '@renderer/i18n'
import { useI18n } from '@renderer/i18n'
import { SplitPane } from '@renderer/components/ui/SplitPane'
import { useState } from 'react'
import { useAnalysisJob } from '@renderer/hooks/useAnalysisJob'
import type { SupportedDraft } from '@shared/enterprise/schema'
import { PAYLOAD_EXAMPLE, SCHEMA_EXAMPLE } from '@shared/enterprise/examples'
import { AnalysisInput, AnalysisResults, AnalysisShell, AnalysisTable, AnalysisToolbar } from './AnalysisUi'

export default function SchemaValidator(): JSX.Element {
  const { t } = useI18n()
  const [schema, setSchema] = useState(''), [payload, setPayload] = useState(''), [draft, setDraft] = useState<SupportedDraft>('2020-12'), [fileError, setFileError] = useState<string | null>(null)
  const job = useAnalysisJob('schema')
  const reset = (): void => { job.invalidate(); setFileError(null) }
  return <AnalysisShell purpose={uiText('Add a schema and JSON, then validate.')} busy={job.busy} hasResult={Boolean(job.result)} error={fileError || job.error}
    toolbar={<AnalysisToolbar action={uiText('Validate payload')} busy={job.busy} run={() => job.run({ schema, payload, draft })} cancel={job.cancel} example={() => { reset(); setSchema(SCHEMA_EXAMPLE); setPayload(PAYLOAD_EXAMPLE); setDraft('2020-12') }} clear={() => { reset(); setSchema(''); setPayload('') }} report={job.result ? JSON.stringify(job.result, null, 2) : undefined} />}
    input={<>
    <label className="flex flex-wrap items-center gap-2 text-[13px]">{t('Schema dialect')}<select aria-label={uiText('Schema dialect')} className="mac-input !w-auto" value={draft} onChange={event => { reset(); setDraft(event.target.value as SupportedDraft) }}><option value="2020-12">Draft 2020-12</option><option value="7">Draft 7</option></select></label>
    <div className="flex h-[340px] min-h-0 flex-col"><SplitPane flush labels={[uiText('JSON Schema'), uiText('Payload JSON')]}><AnalysisInput revision={job.revision} label={uiText('JSON Schema')} value={schema} onChange={value => { reset(); setSchema(value) }} onError={setFileError} placeholder='{"type":"object","required":["id"]}' /><AnalysisInput revision={job.revision} label={uiText('Payload JSON')} value={payload} onChange={value => { reset(); setPayload(value) }} onError={setFileError} placeholder='{"id":"sample"}' /></SplitPane></div>
    </>}
    details={<p className="text-[12px] leading-relaxed text-mac-label-secondary">{uiText('Strict local profile: JSON Pointer $refs, object/array/scalar constraints, composition and conditional rules. Supported formats are checked. Validation stops at the first failure; fix it and run again. External references, nested $id, dynamic/recursive reference keywords, content keywords, custom vocabularies and unknown constraints are refused. Regex or recursive constraints may time out. This is payload validation, not an OpenAPI schema validator.')}</p>}>
    {job.result && <AnalysisResults title={uiText('Validation results')} summary={job.result.valid ? t('Payload is valid under the supported schema profile.') : t('{count} validation findings · payload is invalid', { count: `${job.result.errors.length}${job.result.truncated ? '+' : ''}` })}>
      {job.result.errors.length > 0 && <AnalysisTable headers={[uiText('Field pointer'), uiText('Constraint'), uiText('Schema pointer')]} caption={uiText('Schema errors; payload and constraint values omitted')} rows={job.result.errors.map(issue => [issue.instancePath, issue.keyword, issue.schemaPath])} />}
      {job.result.truncated && <p className="text-[12px] text-mac-label-secondary">{uiText('Showing the first 200 findings.')}</p>}
    </AnalysisResults>}

  </AnalysisShell>
}
