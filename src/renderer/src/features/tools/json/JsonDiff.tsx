import { useMemo, useState } from 'react'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import { parseJson } from '@shared/json'
import { diffJson, summarizeDiff, type DiffEntry } from '@shared/json/diff'
import { cn } from '@renderer/lib/utils'

const LEFT = `{\n  "name": "DevUtils",\n  "version": 1,\n  "features": ["json", "yaml"]\n}`
const RIGHT = `{\n  "name": "DevUtils",\n  "version": 2,\n  "features": ["json", "yaml", "diff"],\n  "local": true\n}`

export default function JsonDiff(): JSX.Element {
  const [left, setLeft] = useState(LEFT)
  const [right, setRight] = useState(RIGHT)

  const leftParsed = useMemo(() => parseJson(left), [left])
  const rightParsed = useMemo(() => parseJson(right), [right])

  const entries = useMemo(() => {
    if (!leftParsed.ok || !rightParsed.ok) return null
    return diffJson(leftParsed.value, rightParsed.value)
  }, [leftParsed, rightParsed])

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
        : summary && summary.added + summary.removed + summary.changed + summary.type === 0
          ? { tone: 'success' as const, text: 'Identical' }
          : {
              tone: 'warning' as const,
              text: summary
                ? `+${summary.added}  −${summary.removed}  ~${summary.changed}  type ${summary.type}`
                : '—'
            }

  return (
    <div className="flex h-full flex-col">
      <ToolToolbar>
        <span className="text-[12px] text-mac-label-secondary">Structural JSON diff</span>
        <div className="ml-auto">
          <CopyButton text={report} label="Copy report" />
        </div>
      </ToolToolbar>

      <div className="grid min-h-0 flex-1 grid-rows-[1fr_minmax(140px,0.7fr)] gap-3 p-3">
        <div className="grid min-h-0 grid-cols-2 gap-3">
          <div className="flex min-h-0 flex-col gap-1">
            <span className="px-1 text-[11px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
              Left (A)
            </span>
            <CodeEditor value={left} onChange={setLeft} language="json" />
          </div>
          <div className="flex min-h-0 flex-col gap-1">
            <span className="px-1 text-[11px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
              Right (B)
            </span>
            <CodeEditor value={right} onChange={setRight} language="json" />
          </div>
        </div>

        <div className="min-h-0 overflow-auto rounded-mac-lg border border-mac-separator bg-mac-surface">
          {!entries ? (
            <div className="flex h-full items-center justify-center text-[13px] text-mac-label-tertiary">
              Fix JSON errors to compare
            </div>
          ) : entries.length === 0 ? (
            <div className="flex h-full items-center justify-center text-[13px] text-mac-success">
              No differences
            </div>
          ) : (
            <ul className="divide-y divide-mac-separator font-mono text-[12px]">
              {entries.map((e) => (
                <DiffRow key={`${e.kind}-${e.path}`} entry={e} />
              ))}
            </ul>
          )}
        </div>
      </div>

      <footer className="flex items-center border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={status.tone}>{status.text}</ToolStatus>
      </footer>
    </div>
  )
}

function DiffRow({ entry }: { entry: DiffEntry }): JSX.Element {
  const color =
    entry.kind === 'added'
      ? 'text-mac-success'
      : entry.kind === 'removed'
        ? 'text-mac-danger'
        : entry.kind === 'type'
          ? 'text-mac-warning'
          : 'text-mac-accent'

  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2 hover:bg-mac-control/50">
      <span className={cn('w-16 shrink-0 font-semibold uppercase', color)}>{entry.kind}</span>
      <span className="min-w-[120px] text-mac-label">{entry.path}</span>
      <span className="text-mac-label-secondary">
        {entry.left !== undefined && (
          <span className="mr-2">
            A: <span className="text-mac-label">{JSON.stringify(entry.left)}</span>
          </span>
        )}
        {entry.right !== undefined && (
          <span>
            B: <span className="text-mac-label">{JSON.stringify(entry.right)}</span>
          </span>
        )}
      </span>
    </li>
  )
}
