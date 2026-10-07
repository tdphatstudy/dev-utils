import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useState } from 'react'
import type { StressProgress } from '@shared/security-testing/types'
import { AnalysisResults, AnalysisTable } from '../enterprise/AnalysisUi'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { Field, NetworkActions, useNetworkJob, Workbench } from './Workbench'
import { RequestComposer, useRequest } from './RequestComposer'

export default function StressTool(): JSX.Element {
  useUiLocale()
  const request = useRequest(), job = useNetworkJob<StressProgress>()
  const [count, setCount] = useState(100), [rate, setRate] = useState(5), [concurrency, setConcurrency] = useState(4), [duration, setDuration] = useState(60)
  const value = job.result ?? job.progress
  return <Workbench purpose="Test API load. Write requests can change server data." limits="Desktop network access begins only on Start. Caps: 10,000 requests, 50 starts/s, concurrency 20, 10 minutes, 64 KiB request body and 128 MiB response budget. One stress test per app." busy={job.busy} hasResult={Boolean(value)} error={job.error} network={true}
    toolbar={<NetworkActions job={job} action={uiText('Start stress test')} start={() => void job.run(id => window.devutils.securityTesting.stress({ request: request.payload(), count, rate, concurrency, durationSeconds: duration }, id))} />}
    input={<>
    <fieldset disabled={job.busy} className="space-y-4 disabled:opacity-70" onChange={job.clear}><RequestComposer request={request} disabled={job.busy} onEdit={job.clear} /><div className="grid grid-cols-2 gap-3">
      <Field label={uiText('Request count')}><input className="mac-input" type="number" min={1} max={10000} value={count} onChange={event => setCount(Number(event.target.value))} /></Field>
      <Field label={uiText('Starts per second')}><input className="mac-input" type="number" min={1} max={50} value={rate} onChange={event => setRate(Number(event.target.value))} /></Field>
      <Field label={uiText('Concurrency')}><input className="mac-input" type="number" min={1} max={20} value={concurrency} onChange={event => setConcurrency(Number(event.target.value))} /></Field>
      <Field label={uiText('Duration limit (s)')}><input className="mac-input" type="number" min={1} max={600} value={duration} onChange={event => setDuration(Number(event.target.value))} /></Field>
    </div></fieldset>
    </>}>
    {value && <AnalysisResults title={uiText('Stress test metrics')} summary={uiText('{state} · {started}/{requested} started · {active} active · {seconds} seconds', { state: uiText({ running: 'Running…', completed: 'Completed', stopped: 'Stopped', 'duration-limit': 'Time limit reached', 'byte-limit': 'Response limit reached' }[value.state]), started: value.started, requested: value.requested, active: value.active, seconds: (value.elapsedMs / 1000).toFixed(1) })}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
        ['HTTP responses', value.completed], ['Successful (2xx)', value.successful], ['HTTP errors (4xx/5xx)', value.httpErrors], ['Network errors', value.networkErrors], ['Cancelled', value.cancelled], ['Actual starts/s', value.startsPerSecond.toFixed(2)], ['Responses/s', value.completionsPerSecond.toFixed(2)], ['Response MiB', (value.bytes / 1048576).toFixed(2)]
      ].map(([label, metric]) => <div key={label} className="rounded-mac-lg border border-mac-separator p-3"><p className="text-[12px] text-mac-label-secondary">{label}</p><p className="text-xl font-semibold tabular-nums">{metric}</p></div>)}</div>
      <p className="text-[12px] text-mac-label-secondary">Latency includes headers and reading up to 256 KiB per response. {value.truncated} responses reached this cap. Redirects are counted without following; response bodies are discarded.</p>
      <AnalysisTable caption="Latency percentiles" headers={['p50 (ms)', 'p95 (ms)', 'p99 (ms)', 'Max (ms)']} rows={[[value.latency.p50, value.latency.p95, value.latency.p99, value.latency.max].map(item => item === undefined ? '—' : item.toFixed(1))]} />
      <AnalysisTable caption="HTTP status counts" headers={['HTTP status', 'Responses']} rows={Object.entries(value.statuses)} />
      {!job.busy && <CopyButton label={uiText('Copy report')} text={JSON.stringify(value, null, 2)} />}
    </AnalysisResults>}
  </Workbench>
}
