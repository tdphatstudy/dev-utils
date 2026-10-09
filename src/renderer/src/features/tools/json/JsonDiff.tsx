import { messageKey } from '@shared/i18n/message-key'
import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useMemo, useState } from 'react'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import { DiffLinesView } from '@renderer/components/ui/DiffLinesView'
import { StructuralDiffList } from '@renderer/components/ui/StructuralDiffList'
import { formatJson, parseJson } from '@shared/json'
import { diffJson, summarizeDiff } from '@shared/json/diff'
import { diffLines, lineDiffReport } from '@shared/text/line-diff'

const LEFT = `{\n  "name": "DevFusion",\n  "version": 1,\n  "features": ["json", "yaml"]\n}`
const RIGHT = `{\n  "name": "DevFusion",\n  "version": 2,\n  "features": ["json", "yaml", "diff"],\n  "local": true\n}`

type ViewMode = 'tree' | 'lines'

export default function JsonDiff(): JSX.Element {
  useUiLocale()
  const [left, setLeft] = useState(LEFT)
  const [right, setRight] = useState(RIGHT)
  const [mode, setMode] = useState<ViewMode>('lines')
  const [normalize, setNormalize] = useState(true)

  const leftParsed = useMemo(() => parseJson(left), [left])
  const rightParsed = useMemo(() => parseJson(right), [right])

  const leftPretty = useMemo(() => {
    if (!normalize) return left
    const r = formatJson(left, { indent: 2 })
    return r.ok ? (r.text ?? left) : left
  }, [left, normalize])

  const rightPretty = useMemo(() => {
    if (!normalize) return right
    const r = formatJson(right, { indent: 2 })
    return r.ok ? (r.text ?? right) : right
  }, [right, normalize])

  const entries = useMemo(() => {
    if (!leftParsed.ok || !rightParsed.ok) return null
    return diffJson(leftParsed.value, rightParsed.value)
  }, [leftParsed, rightParsed])

  const lineStats = useMemo(
    () => diffLines(leftPretty, rightPretty),
    [leftPretty, rightPretty]
  )

  const summary = entries ? summarizeDiff(entries) : null
  const report = entries
    ? entries
        .map((e) => {
          const L = e.left !== undefined ? JSON.stringify(e.left) : '—'
          const R = e.right !== undefined ? JSON.stringify(e.right) : '—'
          return `${e.kind.toUpperCase()} ${e.path}\n  left:  ${L}\n  right: ${R}`
        })
        .join('\n\n')
    : ''

  const status =
    !leftParsed.ok
      ? { tone: 'danger' as const, text: `Left: ${leftParsed.error}` }
      : !rightParsed.ok
        ? { tone: 'danger' as const, text: `Right: ${rightParsed.error}` }
        : mode === 'lines'
          ? lineStats.added + lineStats.removed === 0
            ? { tone: 'success' as const, text: 'Identical (lines)' }
            : {
                tone: 'warning' as const,
                text: `Lines +${lineStats.added}  −${lineStats.removed}  =${lineStats.unchanged}`
              }
          : summary && summary.added + summary.removed + summary.changed + summary.type === 0
            ? { tone: 'success' as const, text: 'Identical (tree)' }
            : {
                tone: 'warning' as const,
                text: summary
                  ? `Tree +${summary.added}  −${summary.removed}  ~${summary.changed}  type ${summary.type}`
                  : '—'
              }

  return (
    <div className="flex h-full flex-col">
      <ToolToolbar>
        <SegmentedControl
          value={mode}
          onChange={setMode}
          options={[
            { value: 'lines', label: messageKey('Lines') },
            { value: 'tree', label: messageKey('Tree') }
          ]}
        />
        <span className="text-[12px] text-mac-label-secondary">
          {mode === 'lines' ? (normalize ? uiText('Compare formatted JSON') : uiText('Compare original text')) : uiText('Compare values by JSONPath')}
        </span>
        {mode === 'lines' && <label className="flex items-center gap-1.5 text-[12px] text-mac-label-secondary"><input type="checkbox" checked={normalize} onChange={(event) => setNormalize(event.target.checked)} className="accent-mac-accent" />{uiText('Format before comparing')}</label>}
        <button type="button" className="mac-btn-secondary" onClick={() => { setLeft(right); setRight(left) }}>{uiText('Swap A / B')}</button>
        <button type="button" className="mac-btn-ghost" onClick={() => { setLeft(LEFT); setRight(RIGHT) }}>{uiText('Sample')}</button>
        <div className="ml-auto">
          <CopyButton text={mode === 'tree' ? report : lineDiffReport(lineStats)} label={uiText('Copy diff')} />
        </div>
      </ToolToolbar>

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,1.15fr)] gap-3 p-3">
        <div className="grid min-h-0 grid-cols-1 gap-3 md:grid-cols-2">
          <div className="flex min-h-[140px] min-w-0 flex-col gap-1 md:min-h-0">
            <span className="px-1 text-[11px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
              {uiText('Left (A)')}</span>
            <CodeEditor value={left} onChange={setLeft} language="json" label={uiText('Left JSON (A)')} issue={!left.trim() || leftParsed.ok ? null : leftParsed} />
          </div>
          <div className="flex min-h-[140px] min-w-0 flex-col gap-1 md:min-h-0">
            <span className="px-1 text-[11px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
              {uiText('Right (B)')}</span>
            <CodeEditor value={right} onChange={setRight} language="json" label={uiText('Right JSON (B)')} issue={!right.trim() || rightParsed.ok ? null : rightParsed} />
          </div>
        </div>

        {mode === 'lines' ? (
          !normalize || (leftParsed.ok && rightParsed.ok) ? (
            <DiffLinesView left={leftPretty} right={rightPretty} leftLabel={normalize ? uiText('A (formatted)') : uiText('A (original)')} rightLabel={normalize ? uiText('B (formatted)') : uiText('B (original)')} />
          ) : (
            <div className="flex items-center justify-center rounded-mac-lg border border-dashed border-mac-separator text-[13px] text-mac-label-tertiary">
              {uiText('Fix JSON errors to highlight lines')}</div>
          )
        ) : (
          <div className="min-h-0 overflow-auto rounded-mac-lg border border-mac-separator bg-mac-surface">
            {!entries ? (
              <div className="flex h-full items-center justify-center text-[13px] text-mac-label-tertiary">
                {uiText('Fix JSON errors to compare tree')}</div>
            ) : (
              <StructuralDiffList entries={entries} />
            )}
          </div>
        )}
      </div>

      <footer className="flex items-center border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={status.tone}>{status.text}</ToolStatus>
        {lineStats.coarse && mode === 'lines' && <span className="ml-auto text-[11px] text-mac-warning">{uiText('Large input: changes grouped between equal prefix and suffix')}</span>}
      </footer>
    </div>
  )
}
