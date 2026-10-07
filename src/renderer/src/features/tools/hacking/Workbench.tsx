import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { cloneElement, useEffect, useId, useRef, useState, type ReactElement } from 'react'
import type { Finding, StressProgress } from '@shared/security-testing/types'
import { AnalysisResults, AnalysisTable } from '../enterprise/AnalysisUi'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { ToolWorkspace, type ToolWorkspaceProps } from '@renderer/components/ui/ToolWorkspace'

export function Workbench({ limits, ...props }: ToolWorkspaceProps & { limits: string }): JSX.Element {
  useUiLocale()
  return <ToolWorkspace {...props} details={<p>{uiText(limits)}</p>} />
}

export function Field({ label, children }: { label: string; children: ReactElement<{ id?: string }> }): JSX.Element {
  useUiLocale()
  const id = useId()
  return <div className="flex min-w-0 flex-col gap-1.5 text-[13px] font-medium"><label htmlFor={id}>{uiText(label)}</label>{cloneElement(children, { id })}</div>
}

export function Findings({ title, summary, findings }: { title: string; summary: string; findings: Finding[] }): JSX.Element {
  useUiLocale()
  const [filter, setFilter] = useState<'all' | 'attention' | 'pass'>('all')
  const warning = findings.filter(value => value.severity === 'warning').length, review = findings.filter(value => value.severity === 'review').length, passed = findings.length - warning - review
  const visible = findings.filter(value => filter === 'all' || (filter === 'pass' ? value.severity === 'pass' : value.severity !== 'pass'))
  return <AnalysisResults title={uiText(title)} summary={summary}>
    <div className="grid grid-cols-3 gap-2 text-[12px]">{[[uiText('Warning'), warning], [uiText('Review'), review], [uiText('Passed'), passed]].map(([label, count]) => <div key={label} className="rounded-mac-lg border border-mac-separator p-3"><p className="text-mac-label-secondary">{label}</p><p className="text-xl font-semibold tabular-nums">{count}</p></div>)}</div>
    <div className="flex flex-wrap gap-2" role="group" aria-label={uiText('Filter findings')}>{([['all', 'All checks'], ['attention', 'Needs attention'], ['pass', 'Passed']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} className={filter === value ? 'mac-btn-primary' : 'mac-btn-secondary'} onClick={() => setFilter(value)}>{uiText(label)}</button>)}</div>
    <CopyButton label={uiText('Copy report')} text={JSON.stringify({ summary, findings }, null, 2)} />
    <AnalysisTable caption={uiText(title)} headers={['Level / check', 'Observation']} rows={visible.map(finding => [
      <span className={finding.severity === 'warning' ? 'text-mac-danger' : finding.severity === 'pass' ? 'text-mac-success' : 'text-mac-label-secondary'}><span className="mb-1 inline-block rounded-md bg-mac-control px-2 py-0.5 text-[11px] font-medium">{uiText(finding.severity === 'pass' ? 'Passed' : finding.severity === 'warning' ? 'Warning' : 'Review')}</span><span className="block">{finding.rule}</span></span>, uiText(finding.detail)
    ])} />
  </AnalysisResults>
}

export function useNetworkJob<T>(): {
  busy: boolean; stopping: boolean; error: string | null; result: T | null; progress: StressProgress | null
  run: (operation: (id: string) => Promise<T>) => Promise<void>; stop: () => void; clear: () => void
} {
  const [busy, setBusy] = useState(false), [stopping, setStopping] = useState(false), [error, setError] = useState<string | null>(null), [result, setResult] = useState<T | null>(null), [progress, setProgress] = useState<StressProgress | null>(null)
  const job = useRef<string | null>(null), mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    const unsubscribe = window.devutils?.securityTesting?.onProgress(value => { if (mounted.current && value.id === job.current) setProgress(value) })
    return () => { mounted.current = false; const id = job.current; job.current = null; unsubscribe?.(); if (id) void window.devutils?.securityTesting?.stop(id).catch(() => {}) }
  }, [])
  const run = async (operation: (id: string) => Promise<T>): Promise<void> => {
    if (job.current) return
    setError(null); setResult(null); setProgress(null); setStopping(false)
    if (!window.devutils?.securityTesting) { setError('Network testing requires the desktop app.'); return }
    const id = crypto.randomUUID(); job.current = id; setBusy(true)
    try { const value = await operation(id); if (mounted.current && job.current === id) setResult(value) }
    catch (cause) { if (mounted.current && job.current === id) setError(cause instanceof Error ? cause.message : 'Security test failed.') }
    finally { if (mounted.current && job.current === id) { job.current = null; setBusy(false); setStopping(false) } }
  }
  const stop = (): void => { const id = job.current; if (!id) return; setStopping(true); void window.devutils.securityTesting.stop(id).catch(() => { if (mounted.current) setError('Unable to request Stop. The time limit still applies.') }) }
  return { busy, stopping, error, result, progress, run, stop, clear: () => { if (!job.current) { setError(null); setResult(null); setProgress(null) } } }
}

export function NetworkActions({ job, action, start }: { job: Pick<ReturnType<typeof useNetworkJob>, 'busy' | 'stopping' | 'stop' | 'error'>; action: string; start: () => void }): JSX.Element {
  useUiLocale()
  return <div className="flex flex-wrap gap-2"><button type="button" className="mac-btn-primary" disabled={job.busy} onClick={start}>{job.busy ? uiText('Running…') : uiText(action)}</button>{job.busy && <button type="button" className="mac-btn-secondary" disabled={job.stopping} onClick={job.stop}>{job.stopping ? uiText('Stopping…') : uiText('Stop')}</button>}</div>
}
