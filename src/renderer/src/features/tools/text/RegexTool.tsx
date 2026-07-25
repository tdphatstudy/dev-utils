import { useMemo, useState } from 'react'
import {
  REGEX_CHEATSHEET,
  REGEX_FLAGS,
  REGEX_SAMPLES,
  explainRegex,
  highlightSegments,
  matchesToJson,
  normalizeFlags,
  replaceRegex,
  splitRegex,
  testRegex,
  type RegexFlag
} from '@shared/regex'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import { useToolDraft } from '@renderer/hooks/useToolDraft'
import { SaveToBoxButton } from '@renderer/features/secret-box/SaveToBoxButton'
import { cn } from '@renderer/lib/utils'

type Mode = 'test' | 'replace' | 'split' | 'explain' | 'cheatsheet'

const FLAG_SET = REGEX_FLAGS.map((f) => f.flag)

export default function RegexTool(): JSX.Element {
  const [mode, setMode] = useState<Mode>('test')
  const [pattern, setPattern] = useState('[\\w.+-]+@[\\w-]+\\.[\\w.-]+')
  const [flags, setFlags] = useState('g')
  const [text, setText] = useState(
    'Contact us@example.com or admin@test.co.uk — also invalid@@x.'
  )
  const [replacement, setReplacement] = useState('[$&]')
  const [splitLimit, setSplitLimit] = useState(0)
  const [selectedMatch, setSelectedMatch] = useState(0)

  useToolDraft('text.regex.pattern', pattern, setPattern, {
    label: 'Regex pattern',
    historyOnUnmount: true
  })
  useToolDraft('text.regex.text', text, setText)

  const flagList = useMemo(() => new Set(normalizeFlags(flags).split('')), [flags])

  const toggleFlag = (f: RegexFlag): void => {
    const next = new Set(flagList)
    if (next.has(f)) next.delete(f)
    else {
      next.add(f)
      if (f === 'u') next.delete('v')
      if (f === 'v') next.delete('u')
    }
    setFlags([...FLAG_SET].filter((x) => next.has(x)).join(''))
  }

  const tested = useMemo(() => testRegex(pattern, flags, text), [pattern, flags, text])
  const replaced = useMemo(
    () => replaceRegex(pattern, flags, text, replacement),
    [pattern, flags, text, replacement]
  )
  const split = useMemo(
    () => splitRegex(pattern, flags, text, splitLimit > 0 ? splitLimit : undefined),
    [pattern, flags, text, splitLimit]
  )
  const tokens = useMemo(() => explainRegex(pattern), [pattern])
  const segments = useMemo(() => {
    if (!tested.ok) return []
    return highlightSegments(text, tested.matches)
  }, [tested, text])

  const jsonOut = tested.ok ? matchesToJson(tested) : ''
  const activeMatch =
    tested.ok && tested.matches.length
      ? tested.matches[Math.min(selectedMatch, tested.matches.length - 1)]
      : null

  const status = !tested.ok
    ? { tone: 'danger' as const, text: tested.error }
    : {
        tone: 'success' as const,
        text: `${tested.matchCount} match${tested.matchCount === 1 ? '' : 'es'} · /${pattern}/${tested.flags}`
      }

  const applySample = (i: number): void => {
    const s = REGEX_SAMPLES[i]
    if (!s) return
    setPattern(s.pattern)
    setFlags(s.flags)
    setText(s.text)
    setMode('test')
    setSelectedMatch(0)
  }

  return (
    <div className="flex h-full flex-col">
      <ToolToolbar>
        <SegmentedControl
          value={mode}
          onChange={setMode}
          options={[
            { value: 'test', label: 'Test' },
            { value: 'replace', label: 'Replace' },
            { value: 'split', label: 'Split' },
            { value: 'explain', label: 'Explain' },
            { value: 'cheatsheet', label: 'Cheatsheet' }
          ]}
        />
        <div className="ml-auto flex items-center gap-2">
          <SaveToBoxButton
            type="json"
            content={jsonOut}
            defaultName="regex-matches.json"
            disabled={!tested.ok || !jsonOut}
          />
          <CopyButton text={pattern} label="Copy pattern" />
          <CopyButton text={jsonOut} label="Copy matches" />
        </div>
      </ToolToolbar>

      {/* Pattern + flags */}
      <div className="space-y-2 border-b border-mac-separator px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[14px] text-mac-label-tertiary">/</span>
          <input
            className="mac-input min-w-[200px] flex-1 font-mono text-[14px]"
            value={pattern}
            onChange={(e) => {
              setPattern(e.target.value)
              setSelectedMatch(0)
            }}
            spellCheck={false}
            placeholder="regular expression"
          />
          <span className="font-mono text-[14px] text-mac-label-tertiary">/</span>
          <input
            className="mac-input !w-24 font-mono text-[14px]"
            value={flags}
            onChange={(e) => setFlags(normalizeFlags(e.target.value))}
            spellCheck={false}
            title="Flags"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {REGEX_FLAGS.map((f) => (
            <button
              key={f.flag}
              type="button"
              title={f.description}
              onClick={() => toggleFlag(f.flag)}
              className={cn(
                'rounded-mac px-2 py-1 text-[11px] font-medium transition-colors',
                flagList.has(f.flag)
                  ? 'bg-mac-accent text-white'
                  : 'bg-mac-control text-mac-label-secondary hover:bg-mac-control-hover'
              )}
            >
              <span className="font-mono">{f.flag}</span>
              <span className="ml-1 opacity-80">{f.label}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {REGEX_SAMPLES.map((s, i) => (
            <button
              key={s.label}
              type="button"
              className="rounded-full border border-mac-separator px-2.5 py-0.5 text-[11px] text-mac-label-secondary hover:bg-mac-control"
              onClick={() => applySample(i)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        {/* Input panel */}
        <div className="flex min-h-0 flex-col border-b border-mac-separator lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-mac-separator px-3 py-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-mac-label-tertiary">
              Test string
            </span>
            <span className="text-[11px] text-mac-label-tertiary">{text.length} chars</span>
          </div>
          {mode === 'replace' && (
            <div className="border-b border-mac-separator px-3 py-2">
              <label className="mb-1 block text-[11px] text-mac-label-tertiary">
                Replacement ($&amp; $1 $&lt;name&gt; …)
              </label>
              <input
                className="mac-input font-mono text-[13px]"
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
                spellCheck={false}
              />
            </div>
          )}
          {mode === 'split' && (
            <div className="border-b border-mac-separator px-3 py-2">
              <label className="mb-1 block text-[11px] text-mac-label-tertiary">
                Limit (0 = no limit)
              </label>
              <input
                type="number"
                min={0}
                className="mac-input !w-28 font-mono"
                value={splitLimit}
                onChange={(e) => setSplitLimit(Number(e.target.value) || 0)}
              />
            </div>
          )}
          <div className="min-h-0 flex-1">
            <CodeEditor value={text} onChange={setText} language="text" placeholder="Text to test…" />
          </div>
        </div>

        {/* Output panel */}
        <div className="flex min-h-0 flex-col overflow-hidden">
          {mode === 'test' && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="border-b border-mac-separator px-3 py-2">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-mac-label-tertiary">
                  Highlight
                </div>
                <div className="max-h-36 overflow-auto whitespace-pre-wrap break-words rounded-mac bg-mac-control/40 p-2 font-mono text-[13px] leading-relaxed">
                  {tested.ok ? (
                    segments.map((s, i) =>
                      s.hit ? (
                        <mark
                          key={i}
                          className={cn(
                            'rounded-sm bg-mac-accent/25 text-mac-label ring-1 ring-mac-accent/30',
                            s.matchIndex === selectedMatch && 'bg-mac-accent/45 ring-mac-accent'
                          )}
                          onClick={() => s.matchIndex != null && setSelectedMatch(s.matchIndex)}
                        >
                          {s.text || '∅'}
                        </mark>
                      ) : (
                        <span key={i}>{s.text}</span>
                      )
                    )
                  ) : (
                    <span className="text-mac-danger">{tested.error}</span>
                  )}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-auto p-3">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-mac-label-tertiary">
                  Matches
                </div>
                {tested.ok && tested.matches.length === 0 && (
                  <p className="text-[13px] text-mac-label-tertiary">No matches</p>
                )}
                <div className="space-y-2">
                  {tested.ok &&
                    tested.matches.map((m, i) => (
                      <button
                        key={`${m.index}-${i}`}
                        type="button"
                        onClick={() => setSelectedMatch(i)}
                        className={cn(
                          'w-full rounded-mac border px-3 py-2 text-left transition-colors',
                          i === selectedMatch
                            ? 'border-mac-accent/40 bg-mac-accent-soft'
                            : 'border-mac-separator hover:bg-mac-control/40'
                        )}
                      >
                        <div className="flex items-center gap-2 text-[12px]">
                          <span className="font-semibold text-mac-label">#{i}</span>
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
                                ${gi + 1} = {g === undefined ? 'undefined' : JSON.stringify(g)}
                              </div>
                            ))}
                            {Object.entries(m.namedGroups).map(([k, v]) => (
                              <div key={k} className="font-mono">
                                {'$<'}
                                {k}
                                {'>'} = {v === undefined ? 'undefined' : JSON.stringify(v)}
                              </div>
                            ))}
                          </div>
                        )}
                      </button>
                    ))}
                </div>

                {activeMatch && (
                  <div className="mt-4 rounded-mac border border-mac-separator bg-mac-surface p-3 text-[12px]">
                    <div className="mb-1 font-semibold">Selected match detail</div>
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
                  Result
                </span>
                {replaced.ok && (
                  <span className="text-[11px] text-mac-label-tertiary">
                    {replaced.count} replacement{replaced.count === 1 ? '' : 's'}
                  </span>
                )}
              </div>
              <div className="min-h-0 flex-1">
                <CodeEditor
                  value={replaced.ok ? replaced.result : replaced.error}
                  language="text"
                  readOnly
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
                        {p === '' ? <em className="text-mac-label-tertiary">(empty)</em> : p}
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
                Token breakdown (heuristic)
              </div>
              {tokens.length === 0 ? (
                <p className="text-[13px] text-mac-label-tertiary">Empty pattern</p>
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
              {!tested.ok && (
                <p className="mt-3 text-[12px] text-mac-danger">Compile error: {tested.error}</p>
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
                Engine: JavaScript RegExp (ECMAScript) — same as Chrome / Node. Not PCRE or .NET.
              </p>
            </div>
          )}
        </div>
      </div>

      <footer className="flex items-center border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={status.tone}>{status.text}</ToolStatus>
      </footer>
    </div>
  )
}
