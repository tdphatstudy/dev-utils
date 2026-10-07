import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useState } from 'react'
import type { StressProgress } from '@shared/security-testing/types'
import { assessLoad } from '@shared/security-testing/load-assessment'
import { AnalysisResults, AnalysisTable } from '../enterprise/AnalysisUi'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { Field, NetworkActions, useNetworkJob, Workbench } from './Workbench'
import { RequestComposer, useRequest } from './RequestComposer'

export default function StressTool(): JSX.Element {
  useUiLocale()
  const request = useRequest(), job = useNetworkJob<StressProgress>()
  const [count, setCount] = useState(100), [rate, setRate] = useState(5), [concurrency, setConcurrency] = useState(4), [duration, setDuration] = useState(60)
  const [p95Limit, setP95Limit] = useState(500), [errorLimit, setErrorLimit] = useState(1)
  const value = job.result ?? job.progress
  const assessment = value ? assessLoad(value, p95Limit, errorLimit) : null
  return <Workbench purpose="Test API load. Write requests can change server data." limits="Desktop network access begins only on Start. Caps: 10,000 requests, 50 starts/s, concurrency 20, 10 minutes, 64 KiB request body and 128 MiB response budget. One stress test per app." busy={job.busy} hasResult={Boolean(value)} error={job.error} network={true}
    toolbar={<NetworkActions job={job} action={uiText('Start stress test')} start={() => void job.run(id => window.devutils.securityTesting.stress({ request: request.payload(), count, rate, concurrency, durationSeconds: duration }, id))} />}
    input={<>
    <fieldset disabled={job.busy} className="space-y-4 disabled:opacity-70" onChange={job.clear}>
      <div className="flex flex-wrap gap-2" role="group" aria-label={uiText('Load presets')}>{[['Quick check', 10, 1, 1, 30], ['Baseline', 100, 5, 4, 60], ['Sustained load', 1000, 20, 10, 120]].map(([name, total, speed, parallel, seconds]) => <button type="button" className="mac-btn-secondary" key={name} onClick={() => { job.clear(); setCount(Number(total)); setRate(Number(speed)); setConcurrency(Number(parallel)); setDuration(Number(seconds)) }}>{uiText(String(name))}</button>)}</div>
      <RequestComposer request={request} disabled={job.busy} onEdit={job.clear} /><div className="grid grid-cols-2 gap-3">
      <Field label={uiText('Request count')}><input className="mac-input" type="number" min={1} max={10000} value={count} onChange={event => setCount(Number(event.target.value))} /></Field>
      <Field label={uiText('Starts per second')}><input className="mac-input" type="number" min={1} max={50} value={rate} onChange={event => setRate(Number(event.target.value))} /></Field>
      <Field label={uiText('Concurrency')}><input className="mac-input" type="number" min={1} max={20} value={concurrency} onChange={event => setConcurrency(Number(event.target.value))} /></Field>
      <Field label={uiText('Duration limit (s)')}><input className="mac-input" type="number" min={1} max={600} value={duration} onChange={event => setDuration(Number(event.target.value))} /></Field>
    </div>
      <p className="rounded-mac-lg border border-mac-separator bg-mac-control/40 p-3 text-[12px] text-mac-label-secondary">{uiText('Minimum sending time')} · {Number.isFinite(count) && rate > 0 ? Math.max(0, (count - 1) / rate).toFixed(1) : '—'} s. {uiText('Slow responses and concurrency can extend this. The duration limit may stop requests early.')}</p>
      <details className="rounded-mac-lg border border-mac-separator p-3"><summary className="cursor-pointer text-[13px] font-medium">{uiText('Acceptance thresholds')}</summary><div className="mt-3 grid grid-cols-2 gap-3" onChange={event => event.stopPropagation()}><Field label="Maximum p95 (ms)"><input className="mac-input" type="number" min={1} max={30000} value={p95Limit} onChange={event => setP95Limit(Number(event.target.value))} /></Field><Field label="Maximum error rate (%)"><input className="mac-input" type="number" min={0} max={100} step={0.1} value={errorLimit} onChange={event => setErrorLimit(Number(event.target.value))} /></Field></div></details>
    </fieldset>
    </>}>
    {value && <AnalysisResults title={uiText('Stress test metrics')} summary={uiText('{state} · {started}/{requested} started · {active} active · {seconds} seconds', { state: uiText({ running: 'Running…', completed: 'Completed', stopped: 'Stopped', 'duration-limit': 'Time limit reached', 'byte-limit': 'Response limit reached' }[value.state]), started: value.started, requested: value.requested, active: value.active, seconds: (value.elapsedMs / 1000).toFixed(1) })}>
      <progress className="h-2 w-full accent-mac-accent" aria-label={uiText('Request count')} max={value.requested} value={value.started} />
      {assessment && <div className="rounded-mac-lg border border-mac-separator bg-mac-control/40 p-3 text-[13px]"><p className="font-semibold">{uiText('Acceptance thresholds')} · {uiText({ running: 'Running…', incomplete: 'Incomplete assessment', pass: 'Within thresholds', fail: 'Threshold exceeded' }[assessment.verdict])}</p><p className="mt-1 text-[12px] text-mac-label-secondary">p95 ≤ {p95Limit} ms · {uiText('Error rate')} {assessment.errorPercent?.toFixed(2) ?? '—'}% / ≤ {errorLimit}%</p><p className="mt-2 text-[12px] text-mac-label-secondary">{uiText('Errors include non-2xx responses and network failures. Cancelled requests are excluded. A partial run cannot pass.')}</p></div>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
        ['HTTP responses', value.completed], ['Successful (2xx)', value.successful], ['HTTP errors (4xx/5xx)', value.httpErrors], ['Network errors', value.networkErrors], ['Cancelled', value.cancelled], ['Actual starts/s', value.startsPerSecond.toFixed(2)], ['Responses/s', value.completionsPerSecond.toFixed(2)], ['Response MiB', (value.bytes / 1048576).toFixed(2)]
      ].map(([label, metric]) => <div key={label} className="rounded-mac-lg border border-mac-separator p-3"><p className="text-[12px] text-mac-label-secondary">{label}</p><p className="text-xl font-semibold tabular-nums">{metric}</p></div>)}</div>
      <p className="text-[12px] text-mac-label-secondary">Latency includes headers and reading up to 256 KiB per response. {value.truncated} responses reached this cap. Redirects are counted without following; response bodies are discarded.</p>
      <AnalysisTable caption="Latency percentiles" headers={['p50 (ms)', 'p95 (ms)', 'p99 (ms)', 'Max (ms)']} rows={[[value.latency.p50, value.latency.p95, value.latency.p99, value.latency.max].map(item => item === undefined ? '—' : item.toFixed(1))]} />
      <AnalysisTable caption="HTTP status counts" headers={['HTTP status', 'Responses']} rows={Object.entries(value.statuses)} />
      {!job.busy && <CopyButton label={uiText('Copy report')} text={JSON.stringify({ ...value, assessment, thresholds: { p95Ms: p95Limit, errorPercent: errorLimit } }, null, 2)} />}
    </AnalysisResults>}
  </Workbench>
}
