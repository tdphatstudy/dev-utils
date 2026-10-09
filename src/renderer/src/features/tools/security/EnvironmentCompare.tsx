import { ToolWorkspace } from '@renderer/components/ui/ToolWorkspace'
import { ToolTextInput } from '@renderer/components/ui/ToolTextInput'
import { SplitPane } from '@renderer/components/ui/SplitPane'
import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useState } from 'react'
import { ArrowLeftRight, Trash2 } from 'lucide-react'
import { compareEnvironments, formatEnvironmentReport, MAX_ENV_LENGTH, type EnvComparison, type EnvStatus } from '@shared/env/compare'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { useToolShortcuts } from '@renderer/shortcuts/useShortcuts'

const LABELS: Record<EnvStatus, string> = { same: 'Same', changed: 'Changed', missing: 'Missing in target', extra: 'Target only' }
const EXAMPLE_BASE = 'APP_ENV=staging\nAPI_URL=https://staging.example.test\nLOG_LEVEL=debug\nFEATURE_CHECKOUT=true'
const EXAMPLE_TARGET = 'APP_ENV=production\nAPI_URL=https://api.example.test\nLOG_LEVEL=warn\nRELEASE_ID=example'

export default function EnvironmentCompare(): JSX.Element {
  useUiLocale()
  const [baseline, setBaseline] = useState(''), [target, setTarget] = useState('')
  const [result, setResult] = useState<EnvComparison | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [differencesOnly, setDifferencesOnly] = useState(true)
  const invalidate = (): void => { setResult(null); setError(null) }
  const compare = (): void => {
    try { setResult(compareEnvironments(baseline, target)); setError(null) }
    catch (failure) { setResult(null); setError(failure instanceof Error ? failure.message : 'Comparison failed.') }
  }
  const duplicateCount = result ? result.duplicateKeys.baseline.length + result.duplicateKeys.target.length : 0
  const rows = result?.rows.filter((row) => !differencesOnly || row.status !== 'same') ?? []
  useToolShortcuts({ 'editor.run': compare })
  return <div className="h-full"><ToolWorkspace purpose={uiText('Compare environment files. Reports hide variable values.')} hasResult={Boolean(result)} error={error}
    toolbar={<div className="flex flex-wrap items-center gap-2">
        <button type="button" className="mac-btn-primary" onClick={compare}><ArrowLeftRight aria-hidden="true" className="h-4 w-4" />{uiText('Compare environments')}</button>
        <button type="button" className="mac-btn-secondary" onClick={() => { setBaseline(EXAMPLE_BASE); setTarget(EXAMPLE_TARGET); invalidate() }}>{uiText('Load example')}</button>
        <button type="button" className="mac-btn-ghost" disabled={!baseline && !target} onClick={() => { setBaseline(''); setTarget(''); invalidate() }}><Trash2 aria-hidden="true" className="h-4 w-4" />{uiText('Clear inputs')}</button>
        {result && <CopyButton text={formatEnvironmentReport(result)} label={uiText('Copy report (no values)')} />}
      </div>}
    input={<div className="flex h-[340px] min-h-0 flex-col"><SplitPane flush labels={[uiText('Baseline · expected configuration'), uiText('Target · configuration to check')]}>{(['baseline', 'target'] as const).map(side => <ToolTextInput key={side} label={side === 'baseline' ? uiText('Baseline · expected configuration') : uiText('Target · configuration to check')} value={side === 'baseline' ? baseline : target} maxLength={MAX_ENV_LENGTH} onRun={compare} onChange={value => { (side === 'baseline' ? setBaseline : setTarget)(value); invalidate() }} />)}</SplitPane></div>}
    details={<p id="env-syntax" className="text-[12px] leading-relaxed text-mac-label-secondary">{uiText('Literal KEY=value assignments, export prefixes, comments and quoted multiline values. Quotes are removed; escapes, substitutions and shell expressions are never evaluated. Unquoted # starts a comment. Last assignment wins; duplicates are flagged. Limit: 256 Ki characters / 5,000 lines per input.')}</p>}>
      {result && <section aria-labelledby="env-results" className="rounded-mac-lg border border-mac-separator bg-mac-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="env-results" className="text-[14px] font-semibold">{uiText('Comparison results')}</h2><label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={differencesOnly} onChange={(event) => setDifferencesOnly(event.target.checked)} />{uiText('Differences only')}</label></div>
        <p role="status" className="mt-2 text-[13px] text-mac-label-secondary">{uiText('{missing} missing · {extra} target only · {changed} changed · {same} same', result.counts)}</p>
        {duplicateCount > 0 && <div role="status" className="mt-3 rounded-mac bg-mac-warning/10 p-3 text-[13px] text-mac-warning">{uiText('Duplicate assignments (last value used):')} {(['baseline', 'target'] as const).map((side) => result.duplicateKeys[side].length ? `${side}: ${result.duplicateKeys[side].join(', ')}` : '').filter(Boolean).join(' · ')}</div>}
        {rows.length ? <div className="mt-3 max-h-96 overflow-auto"><table className="w-full text-left text-[13px]"><caption className="sr-only">{uiText('Variable names and comparison status; values omitted')}</caption><thead><tr className="border-b border-mac-separator"><th scope="col" className="p-2">{uiText('Variable')}</th><th scope="col" className="p-2">{uiText('Status')}</th></tr></thead><tbody>{rows.map((row) => <tr key={row.key} className="border-b border-mac-separator last:border-0"><th scope="row" className="selectable break-all p-2 font-mono font-normal">{row.key}</th><td className="p-2">{uiText(LABELS[row.status])}</td></tr>)}</tbody></table></div> : <p className="mt-4 text-[13px] text-mac-label-secondary">{uiText(result.rows.length ? 'No differences found.' : 'Both inputs contain no variables.')}</p>}
        <p className="mt-3 text-[12px] text-mac-label-secondary">{uiText('Matching values do not prove that a deployment is correct. Review intentional environment differences before releasing.')}</p>
      </section>}
  </ToolWorkspace></div>
}
