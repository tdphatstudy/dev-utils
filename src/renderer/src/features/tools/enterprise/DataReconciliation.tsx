import { t as uiText } from '@renderer/i18n'
import { useI18n } from '@renderer/i18n'
import { SplitPane } from '@renderer/components/ui/SplitPane'
import { useState } from 'react'
import { useAnalysisJob } from '@renderer/hooks/useAnalysisJob'
import { RECONCILE_BASE_EXAMPLE, RECONCILE_TARGET_EXAMPLE } from '@shared/enterprise/examples'
import { AnalysisInput, AnalysisResults, AnalysisShell, AnalysisTable, AnalysisToolbar } from './AnalysisUi'

export default function DataReconciliation(): JSX.Element {
  const { t } = useI18n()
  const [baseline, setBaseline] = useState(''), [target, setTarget] = useState(''), [key, setKey] = useState('/id'), [ignored, setIgnored] = useState(''), [fileError, setFileError] = useState<string | null>(null), [status, setStatus] = useState('differences')
  const job = useAnalysisJob('reconcile')
  const reset = (): void => { job.invalidate(); setFileError(null) }
  return <AnalysisShell purpose={uiText('Compare two lists using a record ID.')} busy={job.busy} hasResult={Boolean(job.result)} error={fileError || job.error}
    toolbar={<AnalysisToolbar action={uiText('Reconcile records')} busy={job.busy} run={() => job.run({ baseline, target, key, ignored })} cancel={job.cancel} example={() => { reset(); setBaseline(RECONCILE_BASE_EXAMPLE); setTarget(RECONCILE_TARGET_EXAMPLE); setKey('/id'); setIgnored('/updatedAt') }} clear={() => { reset(); setBaseline(''); setTarget('') }} report={job.result ? JSON.stringify(job.result, null, 2) : undefined} />}
    input={<>
    <div className="grid grid-cols-1 gap-4"><label className="space-y-2 text-[13px]">{t('Record ID field')}<input className="mac-input font-mono" value={key} onChange={event => { reset(); setKey(event.target.value) }} placeholder={uiText('/id or /customer/id')} /></label><label className="space-y-2 text-[13px]">{t('Fields to ignore (one path per line)')}<textarea className="mac-input h-20 resize-y font-mono" value={ignored} maxLength={8192} onChange={event => { reset(); setIgnored(event.target.value) }} placeholder="/updatedAt" spellCheck={false} /></label></div>
    <div className="flex h-[340px] min-h-0 flex-col"><SplitPane flush labels={[uiText('Baseline records'), uiText('Target records')]}><AnalysisInput revision={job.revision} label={uiText('Baseline records')} value={baseline} onChange={value => { reset(); setBaseline(value) }} onError={setFileError} placeholder='[{"id":"a","balance":100}]' /><AnalysisInput revision={job.revision} label={uiText('Target records')} value={target} onChange={value => { reset(); setTarget(value) }} onError={setFileError} placeholder='[{"id":"a","balance":150}]' /></SplitPane></div>
    </>}
    details={<p className="text-[12px] leading-relaxed text-mac-label-secondary">{uiText('JSON arrays of up to 20,000 objects per side. Keys must be non-empty strings or safe numbers; string “1” and number 1 are distinct. Duplicate keys make all involved rows ambiguous and are not matched. Arrays are order-sensitive; object key order is ignored. Ignored pointers omit an entire subtree. Reports contain row numbers and field pointers only. Quote large numeric identifiers.')}</p>}>
    {job.result && <AnalysisResults title={uiText('Reconciliation results')} summary={t('{changed} changed · {missing} missing · {extra} extra · {duplicate} ambiguous rows · {same} same', job.result.counts)}>
      <label className="flex flex-wrap items-center gap-2 text-[13px]">{t('Show records')}<select aria-label={t('Show records')} className="mac-input !w-auto" value={status} onChange={event => setStatus(event.target.value)}><option value="differences">{t('Differences only')}</option><option value="all">{t('All records')}</option>{['changed', 'missing', 'extra', 'duplicate', 'same'].map(value => <option key={value} value={value}>{t(({ changed: 'Changed', missing: 'Missing', extra: 'Added', duplicate: 'Duplicate', same: 'Same' } as Record<string, string>)[value] || value)}</option>)}</select></label>
      <AnalysisTable headers={[uiText('Status'), uiText('Baseline row'), uiText('Target row'), uiText('Changed field pointers')]} caption={uiText('Reconciliation findings; keys and values omitted')} rows={job.result.rows.filter(row => status === 'all' || (status === 'differences' ? row.status !== 'same' : row.status === status)).map(row => [t(({ changed: 'Changed', missing: 'Missing', extra: 'Added', duplicate: 'Duplicate', same: 'Same' } as Record<string, string>)[row.status]), row.baselineRow ?? '—', row.targetRow ?? '—', (row.fields.join(', ') || '—') + ((row.changedFieldCount ?? 0) > 100 ? ` (first 100 of ${row.changedFieldCount})` : '')])} />
      {job.result.truncated && <p className="text-[12px]">{uiText('Showing the first 1,000 rows; counts cover all records. Each row lists at most 100 changed fields.')}</p>}
    </AnalysisResults>}

  </AnalysisShell>
}
