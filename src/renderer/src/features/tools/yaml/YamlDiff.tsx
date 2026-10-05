import { useMemo, useState } from 'react'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import { DiffLinesView } from '@renderer/components/ui/DiffLinesView'
import { StructuralDiffList } from '@renderer/components/ui/StructuralDiffList'
import { formatYaml, yamlToJson } from '@shared/yaml'
import { diffJson, summarizeDiff } from '@shared/json/diff'
import { diffLines, lineDiffReport } from '@shared/text/line-diff'

const LEFT = `name: DevFusion\nversion: 1\nfeatures:\n  - yaml\n`
const RIGHT = `name: DevFusion\nversion: 2\nfeatures:\n  - yaml\n  - diff\nlocal: true\n`

type ViewMode = 'tree' | 'lines'

export default function YamlDiff(): JSX.Element {
  const [left, setLeft] = useState(LEFT)
  const [right, setRight] = useState(RIGHT)
  const [mode, setMode] = useState<ViewMode>('lines')
  const [normalize, setNormalize] = useState(false)

  const leftParsed = useMemo(() => yamlToJson(left), [left])
  const rightParsed = useMemo(() => yamlToJson(right), [right])

  const leftPretty = useMemo(() => {
    if (!normalize) return left
    const r = formatYaml(left)
    return r.ok ? (r.text ?? left) : left
  }, [left, normalize])

  const rightPretty = useMemo(() => {
    if (!normalize) return right
    const r = formatYaml(right)
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
    ? entries.map((e) => `${e.kind.toUpperCase()} ${e.path}`).join('\n')
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
            { value: 'lines', label: 'Lines' },
            { value: 'tree', label: 'Tree' }
          ]}
        />
        <span className="text-[12px] text-mac-label-secondary">
          {mode === 'lines' ? (normalize ? 'Compare formatted YAML' : 'Compare original text, including comments') : 'Compare values by path'}
        </span>
        {mode === 'lines' && <label className="flex items-center gap-1.5 text-[12px] text-mac-label-secondary"><input type="checkbox" checked={normalize} onChange={(event) => setNormalize(event.target.checked)} className="accent-mac-accent" />Format before comparing</label>}
        <button type="button" className="mac-btn-secondary" onClick={() => { setLeft(right); setRight(left) }}>Swap A / B</button>
        <button type="button" className="mac-btn-ghost" onClick={() => { setLeft(LEFT); setRight(RIGHT) }}>Sample</button>
        <div className="ml-auto">
          <CopyButton text={mode === 'tree' ? report : lineDiffReport(lineStats)} label="Copy diff" />
        </div>
      </ToolToolbar>

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,1.15fr)] gap-3 p-3">
        <div className="grid min-h-0 grid-cols-1 gap-3 md:grid-cols-2">
          <div className="flex min-h-[140px] min-w-0 flex-col gap-1 md:min-h-0">
            <span className="px-1 text-[11px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
              Left (A)
            </span>
            <CodeEditor value={left} onChange={setLeft} language="yaml" label="Left YAML (A)" />
          </div>
          <div className="flex min-h-[140px] min-w-0 flex-col gap-1 md:min-h-0">
            <span className="px-1 text-[11px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
              Right (B)
            </span>
            <CodeEditor value={right} onChange={setRight} language="yaml" label="Right YAML (B)" />
          </div>
        </div>

        {mode === 'lines' ? (
          !normalize || (leftParsed.ok && rightParsed.ok) ? (
            <DiffLinesView
              left={leftPretty}
              right={rightPretty}
              leftLabel={normalize ? 'A (formatted)' : 'A (original)'}
              rightLabel={normalize ? 'B (formatted)' : 'B (original)'}
            />
          ) : (
            <div className="flex items-center justify-center rounded-mac-lg border border-dashed border-mac-separator text-[13px] text-mac-label-tertiary">
              Fix YAML errors to highlight lines
            </div>
          )
        ) : (
          <div className="min-h-0 overflow-auto rounded-mac-lg border border-mac-separator bg-mac-surface">
            {!entries ? (
              <div className="flex h-full items-center justify-center text-[13px] text-mac-label-tertiary">
                Fix YAML errors to compare tree
              </div>
            ) : (
              <StructuralDiffList entries={entries} />
            )}
          </div>
        )}
      </div>

      <footer className="border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={status.tone}>{status.text}</ToolStatus>
        {lineStats.coarse && mode === 'lines' && <span className="ml-2 text-[11px] text-mac-warning">Large input: changes grouped between equal prefix and suffix</span>}
      </footer>
    </div>
  )
}
