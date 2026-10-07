import { useI18n } from '@renderer/i18n'
import { useState } from 'react'
import { useAnalysisJob } from '@renderer/hooks/useAnalysisJob'
import { DEFAULT_LOG_FIELDS, type LogFields, type LogFilters } from '@shared/enterprise/logs'
import { LOG_EXAMPLE } from '@shared/enterprise/examples'
import { AnalysisInput, AnalysisResults, AnalysisShell, AnalysisTable, AnalysisToolbar } from './AnalysisUi'

const EMPTY_FILTERS: LogFilters = { level: '', service: '', trace: '', from: '', to: '' }
const FIELD_LABELS: Record<keyof LogFields, string> = { level: 'Level field', service: 'Service field', trace: 'Trace field', duration: 'Latency field (ms)', timestamp: 'Timestamp field' }
export default function LogExplorer(): JSX.Element {
  const { t } = useI18n()
  const [input, setInput] = useState(''), [fields, setFields] = useState<LogFields>({ ...DEFAULT_LOG_FIELDS }), [filters, setFilters] = useState<LogFilters>({ ...EMPTY_FILTERS }), [fileError, setFileError] = useState<string | null>(null)
  const job = useAnalysisJob('logs')
  const reset = (): void => { job.invalidate(); setFileError(null) }
  const report = job.result ? JSON.stringify({ validRecords: job.result.total, matched: job.result.matched, invalidLines: job.result.invalidLines, invalidCount: job.result.invalidCount, errors: job.result.errors, latencyMs: job.result.latency }, null, 2) : undefined
  return <AnalysisShell purpose="Filter JSONL logs to explore errors and latency." busy={job.busy} hasResult={Boolean(job.result)} error={fileError || job.error}
    toolbar={<AnalysisToolbar action="Analyze logs" busy={job.busy} run={() => job.run({ input, fields, filters })} cancel={job.cancel} example={() => { reset(); setInput(LOG_EXAMPLE); setFields({ ...DEFAULT_LOG_FIELDS }); setFilters({ ...EMPTY_FILTERS }) }} clear={() => { reset(); setInput(''); setFilters({ ...EMPTY_FILTERS }) }} report={report} />}
    input={<>
    <div className="h-[300px]"><AnalysisInput revision={job.revision} label="Structured logs · JSONL" value={input} onChange={value => { reset(); setInput(value) }} onError={setFileError} accept=".jsonl,.ndjson,.log,.txt" placeholder='One JSON object per line: {"level":"info","service":"orders","durationMs":25}' /></div>
    <details className="rounded-mac-lg border border-mac-separator bg-mac-surface p-3"><summary className="cursor-pointer text-[13px] font-semibold">Map log fields · JSON Pointers</summary><div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">{(Object.keys(fields) as (keyof LogFields)[]).map(key => <label key={key} className="space-y-1 text-[12px]">{FIELD_LABELS[key]}<input className="mac-input font-mono" value={fields[key]} onChange={event => { reset(); setFields({ ...fields, [key]: event.target.value }) }} maxLength={1024} /></label>)}</div></details>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="space-y-1 text-[12px]">Level filter<select className="mac-input" value={filters.level} onChange={event => { reset(); setFilters({ ...filters, level: event.target.value }) }}><option value="">All levels</option>{['trace', 'debug', 'info', 'warn', 'error', 'fatal'].map(value => <option key={value} value={value}>{t(({ changed: 'Changed', missing: 'Missing', extra: 'Added', duplicate: 'Duplicate', same: 'Same' } as Record<string, string>)[value] || value)}</option>)}</select></label>{(['service', 'trace', 'from', 'to'] as const).map(key => <label key={key} className="space-y-1 text-[12px]">{{ service: 'Service filter (exact)', trace: 'Trace filter (exact)', from: 'From · ISO timestamp', to: 'To · ISO timestamp' }[key]}<input className="mac-input" value={filters[key]} onChange={event => { reset(); setFilters({ ...filters, [key]: event.target.value }) }} placeholder={key === 'from' || key === 'to' ? '2026-10-06T01:00:00Z' : 'Any'} maxLength={1024} /></label>)}</div>
    </>}
    details={<p className="text-[12px] leading-relaxed text-mac-label-secondary">Up to 20,000 lines. Malformed lines are excluded and their line numbers reported. Pino levels 10–60 are normalized. Latency must be a non-negative number in milliseconds; percentiles use nearest rank over matching samples, not fleet-wide metrics. Time windows are inclusive and require a timezone. The table shows selected metadata, never message/body fields. Copy report exports aggregate counts and latency only.</p>}>
    {job.result && <AnalysisResults title="Log analysis" summary={t('{matched} matched / {total} valid records · {errors} error/fatal · {invalid} invalid lines', { matched: job.result.matched, total: job.result.total, errors: job.result.errors, invalid: job.result.invalidCount })}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{(['p50', 'p95', 'p99', 'max'] as const).map(key => <div key={key} className="rounded-mac-lg border border-mac-separator p-3"><p className="text-[12px] text-mac-label-secondary">{key.toUpperCase()} latency</p><p className="mt-1 text-[16px] font-semibold">{job.result!.latency[key] === undefined ? 'No samples' : `${job.result!.latency[key]} ms`}</p></div>)}</div>
      <p className="text-[12px] text-mac-label-secondary">{job.result.latency.samples} latency samples. {job.result.invalidCount ? `Invalid lines (first 100): ${job.result.invalidLines.join(', ')}.` : 'All non-empty lines parsed.'}</p>
      <div className="grid grid-cols-1 gap-4"><AnalysisTable headers={['Level', 'Count']} caption="Matching logs by level (top 100)" rows={job.result.levels.map(group => [group.name, group.count])} /><AnalysisTable headers={['Service', 'Count']} caption="Matching logs by service (top 100)" rows={job.result.services.map(group => [group.name, group.count])} /></div>
      <AnalysisTable headers={['Line', 'Level', 'Service', 'Trace', 'Timestamp', 'Latency ms']} caption="Matching log metadata; message and body omitted" rows={job.result.rows.map(row => [row.line, row.level || '—', row.service || '—', row.trace || '—', row.timestamp || '—', row.duration ?? '—'])} />
      {job.result.truncated && <p className="text-[12px]">Showing the first 500 matching rows; statistics cover all matching records.</p>}
    </AnalysisResults>}

  </AnalysisShell>
}
