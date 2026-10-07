import { ToolTextInput } from '@renderer/components/ui/ToolTextInput'
import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useEffect, useRef, useState } from 'react'
import type { TextHashAlgorithm } from '@shared/crypto/hash'
import { HASH_LENGTHS, type HashSearchInput, type HashSearchProgress } from '@shared/security-testing/hash-search'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { AnalysisResults } from '../enterprise/AnalysisUi'
import { Field, Workbench } from './Workbench'

export default function HashLab(): JSX.Element {
  const { locale } = useUiLocale()
  const [mode, setMode] = useState('generate'), [algorithm, setAlgorithm] = useState<TextHashAlgorithm>('SHA-256'), [text, setText] = useState(''), [target, setTarget] = useState(''), [source, setSource] = useState<'dictionary' | 'generated'>('dictionary'), [dictionary, setDictionary] = useState(''), [alphabet, setAlphabet] = useState('abc123'), [minLength, setMinLength] = useState(1), [maxLength, setMaxLength] = useState(4), [maxAttempts, setMaxAttempts] = useState(100000), [maxSeconds, setMaxSeconds] = useState(60)
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [hash, setHash] = useState(''), [progress, setProgress] = useState<HashSearchProgress | null>(null), [revealed, setRevealed] = useState(false)
  const worker = useRef<Worker | null>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const terminate = (): void => { worker.current?.terminate(); worker.current = null; if (timer.current) clearTimeout(timer.current); timer.current = null }
  useEffect(() => () => terminate(), [])
  const clear = (): void => { setHash(''); setProgress(null); setError(null); setRevealed(false) }
  const run = (): void => {
    if (worker.current) return
    clear()
    if (mode === 'search' && (!Number.isInteger(maxSeconds) || maxSeconds < 1 || maxSeconds > 600)) { setError('Search duration must be 1–600 seconds.'); return }
    try {
      const instance = new Worker(new URL('../../../workers/hash-search.worker.ts', import.meta.url), { type: 'module' })
      worker.current = instance; setBusy(true)
      const finish = (): void => { terminate(); setBusy(false) }
      instance.onmessage = ({ data }): void => {
        if (worker.current !== instance) return
        if (data.kind === 'progress') setProgress(data.result)
        else if (data.kind === 'done') { setProgress(data.result); finish() }
        else if (data.kind === 'hash') { setHash(data.hash); finish() }
        else if (data.kind === 'error') { setProgress(null); setError(data.error); finish() }
      }
      instance.onerror = (): void => { if (worker.current === instance) { setProgress(null); setError('Hash worker failed. Reduce the input and retry.'); finish() } }
      timer.current = setTimeout(() => { if (worker.current === instance) { setProgress(value => value ? { ...value, state: 'time-limit' } : null); setError(mode === 'search' ? 'Search reached its time budget. Stop was enforced by terminating the worker.' : 'Hash generation exceeded 5 seconds.'); finish() } }, mode === 'search' ? maxSeconds * 1000 + 1000 : 5000)
      if (mode === 'generate') instance.postMessage({ text, algorithm })
      else { const input: HashSearchInput = { algorithm, target, mode: source, dictionary, alphabet, minLength, maxLength, maxAttempts, maxSeconds }; instance.postMessage({ input }) }
    } catch { terminate(); setBusy(false); setError('Unable to start the local hash worker.') }
  }
  return <Workbench purpose="Create a hash or search candidates. Hashes cannot be decoded." limits="Local worker, no uploads. MD5 and SHA-1 are legacy checksums, unsuitable for password storage. Search stops at a match, candidate exhaustion, the attempt/time budget or Stop. Max 10 million attempts and 10 minutes." busy={busy} hasResult={Boolean(hash || progress)} error={error} network={false}
    toolbar={<div className="flex flex-wrap gap-2"><button type="button" className="mac-btn-primary" disabled={busy} onClick={run}>{busy ? uiText('Working…') : mode === 'generate' ? uiText('Generate hash') : uiText('Search candidates')}</button>{busy && <button type="button" className="mac-btn-secondary" onClick={() => { terminate(); setBusy(false); setProgress(value => value ? { ...value, state: 'stopped' } : null); setError('Hash operation stopped.') }}>{uiText('Stop')}</button>}<button type="button" className="mac-btn-ghost" disabled={busy} onClick={() => { setText(''); setTarget(''); setDictionary(''); clear() }}>{uiText('Clear inputs')}</button></div>}
    input={<>
    <fieldset disabled={busy} className="space-y-3" onChange={clear}><div className="grid gap-3 sm:grid-cols-2"><Field label={uiText('Hash operation')}><select className="mac-input" value={mode} onChange={event => setMode(event.target.value)}><option value="generate">{uiText('Text → hash')}</option><option value="search">{uiText('Hash → candidate search')}</option></select></Field>
      <Field label={uiText('Hash algorithm')}><select className="mac-input" value={algorithm} onChange={event => setAlgorithm(event.target.value as TextHashAlgorithm)}>{Object.keys(HASH_LENGTHS).map(value => <option key={value}>{value}</option>)}</select></Field></div>
      {mode === 'generate' ? <ToolTextInput label="Input text" value={text} maxLength={1048576} disabled={busy} onChange={value => { clear(); setText(value) }} /> : <>
        <Field label={uiText('Target hash (hexadecimal)')}><input className="mac-input font-mono" value={target} maxLength={128} onChange={event => setTarget(event.target.value)} spellCheck={false} autoComplete="off" /></Field>
        <Field label={uiText('Candidate source')}><select className="mac-input max-w-sm" value={source} onChange={event => setSource(event.target.value as typeof source)}><option value="dictionary">{uiText('Dictionary — one candidate per line')}</option><option value="generated">{uiText('Generate from alphabet')}</option></select></Field>
        {source === 'dictionary' ? <><ToolTextInput label="Candidate dictionary" value={dictionary} maxLength={1048576} disabled={busy} onChange={value => { clear(); setDictionary(value) }} /><p className="text-[12px] text-mac-label-secondary">Up to 100,000 lines, 128 characters per line, 1 Mi characters total. Spaces are preserved; an empty line tests the empty string. Unsalted raw hashes only.</p></> : <div className="grid gap-3 grid-cols-2"><Field label={uiText('Candidate alphabet')}><input className="mac-input font-mono" value={alphabet} maxLength={64} onChange={event => setAlphabet(event.target.value)} autoComplete="off" spellCheck={false} /></Field><Field label={uiText('Minimum length')}><input className="mac-input" type="number" min={0} max={16} value={minLength} onChange={event => setMinLength(Number(event.target.value))} /></Field><Field label={uiText('Maximum length')}><input className="mac-input" type="number" min={0} max={16} value={maxLength} onChange={event => setMaxLength(Number(event.target.value))} /></Field></div>}
        <div className="grid gap-3 sm:grid-cols-2"><Field label={uiText('Attempt budget')}><input className="mac-input" type="number" min={1} max={10000000} value={maxAttempts} onChange={event => setMaxAttempts(Number(event.target.value))} /></Field><Field label={uiText('Search duration (s)')}><input className="mac-input" type="number" min={1} max={600} value={maxSeconds} onChange={event => setMaxSeconds(Number(event.target.value))} /></Field></div>
      </>}
    </fieldset>
    </>}>
    {hash && <AnalysisResults title={uiText('Generated hash')} summary={`${algorithm} · UTF-8 input`}><p className="selectable break-all font-mono text-[13px]">{hash}</p><CopyButton label={uiText('Copy hash')} text={hash} /></AnalysisResults>}
    {progress && <AnalysisResults title={uiText('Candidate search')} summary={uiText('{state} · {tested}/{total} candidates · {rate}/s · {seconds} s', { state: uiText({ running: 'Searching…', found: 'Match found', exhausted: 'No match', 'attempt-limit': 'Attempt limit reached', 'time-limit': 'Time limit reached', stopped: 'Stopped' }[progress.state]), tested: progress.attempted.toLocaleString(locale), total: progress.totalCandidates, rate: progress.candidatesPerSecond.toFixed(1), seconds: (progress.elapsedMs / 1000).toFixed(1) })}>
      {progress.match !== undefined && <div className="space-y-2"><p className="text-[13px]">Matching candidate found. Its plaintext remains in this view until you clear it or leave.</p><button type="button" className="mac-btn-secondary" onClick={() => setRevealed(!revealed)}>{revealed ? uiText('Hide match') : uiText('Reveal match')}</button>{revealed && <><pre className="selectable whitespace-pre-wrap break-all rounded-mac-lg border border-mac-separator p-3">{progress.match === '' ? '(empty string)' : progress.match}</pre><CopyButton label={uiText('Copy matching candidate')} text={progress.match} /></>}</div>}
      {!busy && progress.state !== 'found' && <p className="text-[13px] text-mac-label-secondary">No match in the candidates tested. Expand your authorized candidate set or budget to try again.</p>}
    </AnalysisResults>}
  </Workbench>
}
