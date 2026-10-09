import { messageKey } from '@shared/i18n/message-key'
import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useEffect, useId, useMemo, useState } from 'react'
import { Undo2 } from 'lucide-react'
import {
  REGEX_CHEATSHEET,
  REGEX_FLAGS,
  REGEX_SAMPLES,
  explainRegex,
  highlightSegments,
  matchesToJson,
  normalizeFlags,
  type RegexFlag
} from '@shared/regex'
import { useRegexJob } from './useRegexJob'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { ToolOptions, ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import { SplitPane } from '@renderer/components/ui/SplitPane'
import { useToolDraft } from '@renderer/hooks/useToolDraft'
import { SaveToBoxButton } from '@renderer/features/secret-box/SaveToBoxButton'
import { cn } from '@renderer/lib/utils'

type Mode = 'test' | 'replace' | 'split' | 'explain' | 'cheatsheet'

const FLAG_SET = REGEX_FLAGS.map((f) => f.flag)
const MODES: Mode[] = ['test', 'replace', 'split', 'explain', 'cheatsheet']
const PREVIEW_LIMIT = 20_000

export default function RegexTool(): JSX.Element {
  useUiLocale()
  const [mode, setMode] = useState<Mode>('test')
  const [activePane, setActivePane] = useState<0 | 1>(0)
  const [pattern, setPattern] = useState('[\\w.+-]+@[\\w-]+\\.[\\w.-]+')
  const [flags, setFlags] = useState('g')
  const [text, setText] = useState(
    'Contact us@example.com or admin@test.co.uk — also invalid@@x.'
  )
  const [replacement, setReplacement] = useState('[$&]')
  const [splitLimit, setSplitLimit] = useState(0)
  const [selectedMatch, setSelectedMatch] = useState(0)
  const [timeoutMs, setTimeoutMs] = useState(1500)
  const [shownMatches, setShownMatches] = useState(50)
  const [undo, setUndo] = useState<{ pattern: string; flags: string; text: string; mode: Mode } | null>(null)
  const errorId = useId()

  useToolDraft('text.regex.pattern', pattern, setPattern, {
    label: messageKey('Regex pattern'),
    historyOnUnmount: true
  })
  useToolDraft('text.regex.text', text, setText)
  useToolDraft('text.regex.flags', flags, setFlags)
  useToolDraft('text.regex.mode', mode, (value) => { if (MODES.includes(value as Mode)) { setMode(value as Mode); setActivePane(value === 'explain' || value === 'cheatsheet' ? 1 : 0) } })
  useToolDraft('text.regex.replacement', replacement, setReplacement)
  useToolDraft('text.regex.split-limit', String(splitLimit), (value) => {
    const limit = Number(value)
    if (Number.isInteger(limit) && limit >= 0 && limit <= 1000) setSplitLimit(limit)
  })
  useToolDraft('text.regex.timeout', String(timeoutMs), (value) => {
    const limit = Number(value)
    if ([1500, 3000, 5000].includes(limit)) setTimeoutMs(limit)
  })

  const flagList = useMemo(() => new Set(normalizeFlags(flags).split('')), [flags])

  const toggleFlag = (f: RegexFlag): void => {
    setUndo(null)
    const next = new Set(flagList)
    if (next.has(f)) next.delete(f)
    else {
      next.add(f)
      if (f === 'u') next.delete('v')
      if (f === 'v') next.delete('u')
    }
    setFlags([...FLAG_SET].filter((x) => next.has(x)).join(''))
  }

  const job = useMemo(() => ({ mode, pattern, flags, text, replacement, splitLimit }), [mode, pattern, flags, text, replacement, splitLimit])
  const { result, pending, cancel, rerun } = useRegexJob(job, timeoutMs)
  useEffect(() => { setSelectedMatch(0); setShownMatches(50) }, [result])
  const fallback = { ok: false as const, error: pending ? 'Evaluating…' : result?.error ?? 'No result' }
  const tested = result?.tested ?? fallback
  const replaced = result?.replaced ?? fallback
  const split = result?.split ?? fallback
  const tokens = useMemo(() => mode === 'explain' && pattern.length <= 16384 ? explainRegex(pattern) : [], [pattern, mode])
  const segments = useMemo(() => {
    if (!tested.ok) return []
    return highlightSegments(text.slice(0, PREVIEW_LIMIT), tested.matches.filter((match) => match.end <= PREVIEW_LIMIT))
  }, [tested, text])

  const jsonOut = tested.ok ? matchesToJson(tested) : ''
  const output = mode === 'test' ? jsonOut : mode === 'replace' && replaced.ok ? replaced.result : mode === 'split' && split.ok ? JSON.stringify(split.parts, null, 2) : ''
  const current = mode === 'test' ? tested : mode === 'replace' ? replaced : mode === 'split' ? split : null
  const activeIndex = tested.ok ? Math.min(selectedMatch, Math.max(0, tested.matches.length - 1)) : 0
  const activeMatch =
    tested.ok && tested.matches.length
      ? tested.matches[activeIndex]
      : null

  const error = result?.error ?? (current && !current.ok ? current.error : undefined)
  const flagsInvalid = Boolean(error && /^(Unknown flag|Duplicate flag|Flags u and v)/.test(error))
  const patternInvalid = Boolean(error?.startsWith('Invalid regular expression'))
  const status = pending ? { tone: 'neutral' as const, text: 'Evaluating in worker…' }
    : error ? { tone: 'danger' as const, text: 'Evaluation stopped · See the error above' }
    : { tone: current?.ok && (mode !== 'test' || tested.ok && tested.matchCount > 0) ? 'success' as const : 'neutral' as const,
      text: `${mode === 'test' && tested.ok ? `${tested.matchCount} matches${!flagList.has('g') ? ' · first match only (g off)' : ''}` : mode === 'replace' && replaced.ok ? `${replaced.count} replacements` : mode === 'split' && split.ok ? `${split.parts.length} parts` : 'Pattern compiles'} · ${result?.durationMs.toFixed(1)} ms · JavaScript RegExp` }

  const applySample = (i: number): void => {
    const s = REGEX_SAMPLES[i]
    if (!s) return
    setUndo({ pattern, flags, text, mode })
    setPattern(s.pattern)
    setFlags(s.flags)
    setText(s.text)
    setMode('test')
    setActivePane(0)
    setSelectedMatch(0)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ToolToolbar label={uiText('Regex mode and execution')} className="max-h-[40%] overflow-y-auto">
        <SegmentedControl
          value={mode}
          onChange={(value) => { setMode(value); setActivePane(value === 'explain' || value === 'cheatsheet' ? 1 : 0); setUndo(null) }}
          label={uiText('Regex mode')}
          options={[
            { value: 'test', label: messageKey('Test') },
            { value: 'replace', label: messageKey('Replace') },
            { value: 'split', label: messageKey('Split') },
            { value: 'explain', label: messageKey('Explain') },
            { value: 'cheatsheet', label: messageKey('Cheatsheet') }
          ]}
        />
        <button type="button" className="mac-btn-primary" onClick={pending ? cancel : rerun}>{pending ? uiText('Cancel') : uiText('Run')}</button>
        {undo && <button type="button" className="mac-btn-secondary" title={uiText('Restore the pattern, flags and test string before the example')} onClick={() => { setPattern(undo.pattern); setFlags(undo.flags); setText(undo.text); setMode(undo.mode); setUndo(null) }}><Undo2 className="h-3.5 w-3.5" aria-hidden />{uiText('Undo example')}</button>}
        <ToolOptions label={uiText('Options & examples')}>
          <select className="mac-input !w-auto max-w-full" aria-label={uiText('Regex example')} value="" onChange={(event) => applySample(Number(event.target.value))}>
            <option value="" disabled>{uiText('Choose an example…')}</option>
            {REGEX_SAMPLES.map((sample, index) => <option value={index} key={sample.label}>{sample.label}</option>)}
          </select>
          <select className="mac-input !w-auto" aria-label={uiText('Regex time limit')} value={timeoutMs} onChange={(event) => setTimeoutMs(Number(event.target.value))}>
            <option value={1500}>{uiText('1.5s limit')}</option><option value={3000}>{uiText('3s limit')}</option><option value={5000}>{uiText('5s limit')}</option>
          </select>
          <CopyButton text={pattern} label={uiText('Copy pattern')} />
          <div className="flex w-full flex-wrap gap-1.5" role="group" aria-label={uiText('Regex flag switches')}>
            {REGEX_FLAGS.map((flag) => <button key={flag.flag} type="button" title={flag.description} aria-pressed={flagList.has(flag.flag)} onClick={() => toggleFlag(flag.flag)} className={cn('mac-btn-secondary !px-2 !text-[12px]', flagList.has(flag.flag) && '!bg-mac-accent-fill !text-white')}><span className="font-mono">{flag.flag}</span>{flag.label}</button>)}
          </div>
        </ToolOptions>
      </ToolToolbar>

      {/* Pattern + flags */}
      <div className="shrink-0 border-b border-mac-separator px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[14px] text-mac-label-tertiary">/</span>
          <input
            className="mac-input min-w-[200px] flex-1 font-mono text-[14px]"
            value={pattern}
            onChange={(e) => {
              setPattern(e.target.value)
              setSelectedMatch(0)
              setUndo(null)
            }}
            spellCheck={false}
            placeholder={uiText('regular expression')}
            aria-label={uiText('Regex pattern')}
            aria-invalid={!pending && patternInvalid}
            aria-describedby={!pending && patternInvalid ? errorId : undefined}
          />
          <span className="font-mono text-[14px] text-mac-label-tertiary">/</span>
          <input
            className="mac-input !w-24 font-mono text-[14px]"
            value={flags}
            onChange={(e) => { setFlags(e.target.value); setUndo(null) }}
            spellCheck={false}
            title={uiText('Flags')}
            aria-label={uiText('Regex flags')}
            aria-invalid={!pending && flagsInvalid}
            aria-describedby={!pending && flagsInvalid ? errorId : undefined}
          />
        </div>
      </div>

      {error && !pending && <p id={errorId} className="max-h-20 shrink-0 overflow-auto border-b border-mac-separator px-4 py-2 text-[12px] text-mac-danger [overflow-wrap:anywhere]" role="alert">{error}</p>}

      <SplitPane labels={[uiText('Test string'), uiText('Results')]} activePane={activePane} onPaneChange={setActivePane}>
        {/* Input panel */}
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-mac-lg border border-mac-separator bg-mac-surface">
          {mode === 'replace' && (
            <div className="border-b border-mac-separator px-3 py-2">
              <label htmlFor="regex-replacement" className="mb-1 block text-[11px] text-mac-label-tertiary">
                {uiText('Replacement ($&amp; $1 $&lt;name&gt; …)')}</label>
              <input
                className="mac-input font-mono text-[13px]"
                id="regex-replacement"
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
                spellCheck={false}
              />
            </div>
          )}
          {mode === 'split' && (
            <div className="border-b border-mac-separator px-3 py-2">
              <label htmlFor="regex-split-limit" className="mb-1 block text-[11px] text-mac-label-tertiary">
                {uiText('Limit (0 = up to 1000 parts)')}</label>
              <input
                type="number"
                min={0}
                max={1000}
                id="regex-split-limit"
                className="mac-input !w-28 font-mono"
                value={splitLimit}
                onChange={(e) => setSplitLimit(Number(e.target.value) || 0)}
              />
            </div>
          )}
          <div className="min-h-0 flex-1">
            <CodeEditor value={text} onChange={(value) => { if (value !== text) { setText(value); setUndo(null) } }} language="text" placeholder={uiText('Text to test…')} label={uiText('Regex test string')} onRun={rerun} className="!rounded-none !border-0" />
          </div>
        </div>

        {/* Output panel */}
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-mac-lg border border-mac-separator bg-mac-surface">
          <ToolToolbar label={uiText('Regex output actions')} className="!px-2 !py-2">
            <span className="mr-auto text-[12px] font-semibold text-mac-label">{mode === 'test' ? uiText('Matches') : mode === 'replace' ? uiText('Replacement result') : mode === 'split' ? uiText('Split parts') : mode === 'explain' ? uiText('Pattern explanation') : uiText('RegExp reference')}</span>
            {current && <>
              <CopyButton text={output} label={mode === 'replace' ? uiText('Copy result') : mode === 'split' ? uiText('Copy parts') : uiText('Copy matches')} />
              <ToolOptions label={uiText('Export')}>
                <SaveToBoxButton type={mode === 'replace' ? 'text' : 'json'} content={output} defaultName={mode === 'replace' ? 'regex-replacement.txt' : mode === 'split' ? 'regex-split.json' : 'regex-matches.json'} disabled={pending || !current.ok || (mode !== 'replace' && !output)} />
              </ToolOptions>
            </>}
          </ToolToolbar>
          {mode === 'test' && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="max-h-[40%] shrink-0 overflow-auto border-b border-mac-separator px-3 py-2">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-mac-label-tertiary">
                  {uiText('Highlight')}</div>
                <div className="max-h-36 overflow-auto whitespace-pre-wrap break-words rounded-mac bg-mac-control/40 p-2 font-mono text-[13px] leading-relaxed">
                  {tested.ok ? (
                    segments.map((s, i) =>
                      s.hit ? (
                        <mark
                          key={i}
                          className={cn(
                            'rounded-sm bg-mac-accent/25 text-mac-label ring-1 ring-mac-accent/30',
                            s.matchIndex === activeIndex && 'bg-mac-accent/45 ring-mac-accent'
                          )}
                          onClick={() => s.matchIndex != null && setSelectedMatch(s.matchIndex)}
                          role="button"
                          tabIndex={0}
                          aria-label={uiText('Select match {value1}', { value1: (s.matchIndex ?? 0) + 1 })}
                          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (s.matchIndex != null) setSelectedMatch(s.matchIndex) } }}
                        >
                          {s.text || '∅'}
                        </mark>
                      ) : (
                        <span key={i}>{s.text}</span>
                      )
                    )
                  ) : (
                    <span className="text-mac-label-secondary">{pending ? uiText('Evaluating…') : uiText('Update the inputs and run again.')}</span>
                  )}
                </div>
                {text.length > PREVIEW_LIMIT && <p className="mt-1 text-[12px] text-mac-label-secondary">{uiText('Highlight preview: first')} {PREVIEW_LIMIT.toLocaleString()} {uiText('characters. Match results and copies include the complete test string.')}</p>}
              </div>

              <div className="min-h-0 flex-1 overflow-auto p-3">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-mac-label-tertiary">
                  {uiText('Matches')}</div>
                {tested.ok && tested.matches.length === 0 && (
                  <p className="text-[13px] text-mac-label-secondary">{uiText('No matches. Check the pattern, flags or test string.')}</p>
                )}
                <div className="space-y-2">
                  {tested.ok &&
                    tested.matches.slice(0, shownMatches).map((m, i) => (
                      <button
                        key={`${m.index}-${i}`}
                        type="button"
                        onClick={() => setSelectedMatch(i)}
                        aria-pressed={i === activeIndex}
                        className={cn(
                          'w-full rounded-mac border px-3 py-2 text-left transition-colors',
                          i === activeIndex
                            ? 'border-mac-accent/40 bg-mac-accent-soft'
                            : 'border-mac-separator hover:bg-mac-control/40'
                        )}
                      >
                        <div className="flex items-center gap-2 text-[12px]">
                          <span className="font-semibold text-mac-label">#{i + 1}</span>
                          <code className="truncate font-mono text-mac-accent">
                            {m.match === '' ? '∅ zero-width' : m.match}
                          </code>
                          <span className="ml-auto font-mono text-[11px] text-mac-label-tertiary">
                            [{m.index}…{m.end})
                          </span>
                        </div>
                        {(m.groups.length > 0 || Object.keys(m.namedGroups).length > 0) && (
                          <div className="mt-1.5 space-y-0.5 text-[11px] text-mac-label-secondary">
                            {m.groups.map((g, gi) => (
                              <div key={gi} className="font-mono">
                                ${gi + 1} = {g === undefined ? uiText('undefined') : JSON.stringify(g)}
                              </div>
                            ))}
                            {Object.entries(m.namedGroups).map(([k, v]) => (
                              <div key={k} className="font-mono">
                                {'$<'}
                                {k}
                                {'>'} = {v === undefined ? uiText('undefined') : JSON.stringify(v)}
                              </div>
                            ))}
                          </div>
                        )}
                      </button>
                    ))}
                </div>
                {tested.ok && tested.matches.length > shownMatches && <button type="button" className="mac-btn-secondary mt-3" onClick={() => setShownMatches((count) => count + 50)}>{uiText('Show next')} {Math.min(50, tested.matches.length - shownMatches)} {uiText('matches (')}{shownMatches} {uiText('of')} {tested.matchCount})</button>}

                {activeMatch && (
                  <div className="mt-4 rounded-mac border border-mac-separator bg-mac-surface p-3 text-[12px]">
                    <div className="mb-1 font-semibold">{uiText('Selected match detail')}</div>
                    <pre className="overflow-auto font-mono text-[11px] text-mac-label-secondary">
                      {JSON.stringify(activeMatch, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {mode === 'replace' && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-center justify-between border-b border-mac-separator px-3 py-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-mac-label-tertiary">
                  {uiText('Result')}</span>
                {replaced.ok && (
                  <span className="text-[11px] text-mac-label-tertiary">
                    {replaced.count} {uiText('replacement')}{replaced.count === 1 ? '' : 's'}
                  </span>
                )}
              </div>
              <div className="min-h-0 flex-1">
                <CodeEditor
                  value={replaced.ok ? replaced.result : replaced.error}
                  language="text"
                  readOnly
                  label={uiText('Regex replacement result')}
                />
              </div>
            </div>
          )}

          {mode === 'split' && (
            <div className="min-h-0 flex-1 overflow-auto p-3">
              {split.ok ? (
                <ol className="space-y-1.5">
                  {split.parts.map((p, i) => (
                    <li
                      key={i}
                      className="flex gap-2 rounded-mac border border-mac-separator px-3 py-2 font-mono text-[12px]"
                    >
                      <span className="text-mac-label-tertiary">[{i}]</span>
                      <span className="break-all text-mac-label">
                        {p === undefined ? <em className="text-mac-label-tertiary">{uiText('(unmatched capture)')}</em> : p === '' ? <em className="text-mac-label-tertiary">{uiText('(empty)')}</em> : p}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-mac-danger">{split.error}</p>
              )}
            </div>
          )}

          {mode === 'explain' && (
            <div className="min-h-0 flex-1 overflow-auto p-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-mac-label-tertiary">
                {uiText('Token breakdown (heuristic)')}</div>
              {tokens.length === 0 ? (
                <p className="text-[13px] text-mac-label-tertiary">{uiText('Empty pattern')}</p>
              ) : (
                <div className="space-y-1">
                  {tokens.map((t, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[minmax(80px,auto)_100px_1fr] gap-2 rounded-mac border border-mac-separator px-3 py-1.5 text-[12px]"
                    >
                      <code className="font-mono text-mac-accent">{t.raw}</code>
                      <span className="text-[11px] uppercase tracking-wide text-mac-label-tertiary">
                        {t.kind}
                      </span>
                      <span className="text-mac-label-secondary">{t.meaning}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {mode === 'cheatsheet' && (
            <div className="min-h-0 flex-1 overflow-auto p-3">
              {REGEX_CHEATSHEET.map((cat) => (
                <div key={cat.category} className="mb-5">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-mac-label-tertiary">
                    {cat.category}
                  </div>
                  <div className="overflow-hidden rounded-mac border border-mac-separator">
                    <table className="w-full text-left text-[12px]">
                      <tbody>
                        {cat.rows.map((row) => (
                          <tr
                            key={row.token}
                            className="border-b border-mac-separator last:border-0"
                          >
                            <td className="w-[140px] bg-mac-control/30 px-3 py-1.5 font-mono text-mac-accent">
                              {row.token}
                            </td>
                            <td className="px-3 py-1.5 text-mac-label-secondary">{row.meaning}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
              <p className="text-[11px] text-mac-label-tertiary">
                {uiText('Engine: JavaScript RegExp (ECMAScript) — same as Chrome / Node. Not PCRE or .NET.')}</p>
            </div>
          )}
        </div>
      </SplitPane>

      <footer className="flex shrink-0 items-center border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={status.tone}>{status.text}</ToolStatus>
      </footer>
    </div>
  )
}
