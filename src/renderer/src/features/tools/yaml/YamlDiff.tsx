import { useMemo, useState } from 'react'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import { parseYaml } from '@shared/yaml'
import { diffJson, summarizeDiff, type DiffEntry } from '@shared/json/diff'
import { cn } from '@renderer/lib/utils'

const LEFT = `name: DevUtils\nversion: 1\nfeatures:\n  - yaml\n`
const RIGHT = `name: DevUtils\nversion: 2\nfeatures:\n  - yaml\n  - diff\nlocal: true\n`

export default function YamlDiff(): JSX.Element {
  const [left, setLeft] = useState(LEFT)
  const [right, setRight] = useState(RIGHT)

  const leftParsed = useMemo(() => parseYaml(left), [left])
  const rightParsed = useMemo(() => parseYaml(right), [right])

  const entries = useMemo(() => {
    if (!leftParsed.ok || !rightParsed.ok) return null
    return diffJson(leftParsed.value, rightParsed.value)
  }, [leftParsed, rightParsed])

  const summary = entries ? summarizeDiff(entries) : null
  const report = entries
    ? entries
        .map((e) => `${e.kind.toUpperCase()} ${e.path}`)
        .join('\n')
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
        <span className="text-[12px] text-mac-label-secondary">Structural YAML diff (via parse)</span>
        <div className="ml-auto">
          <CopyButton text={report} label="Copy report" />
        </div>
      </ToolToolbar>

      <div className="grid min-h-0 flex-1 grid-rows-[1fr_minmax(140px,0.7fr)] gap-3 p-3">
        <div className="grid min-h-0 grid-cols-2 gap-3">
          <CodeEditor value={left} onChange={setLeft} language="yaml" />
          <CodeEditor value={right} onChange={setRight} language="yaml" />
        </div>
        <div className="min-h-0 overflow-auto rounded-mac-lg border border-mac-separator bg-mac-surface">
          {!entries ? (
            <div className="flex h-full items-center justify-center text-[13px] text-mac-label-tertiary">
              Fix YAML errors to compare
            </div>
          ) : entries.length === 0 ? (
            <div className="flex h-full items-center justify-center text-[13px] text-mac-success">
              No differences
            </div>
          ) : (
            <ul className="divide-y divide-mac-separator font-mono text-[12px]">
              {entries.map((e) => (
                <li key={`${e.kind}-${e.path}`} className="flex gap-3 px-3 py-2">
                  <span
                    className={cn(
                      'w-16 font-semibold uppercase',
                      e.kind === 'added' && 'text-mac-success',
                      e.kind === 'removed' && 'text-mac-danger',
                      e.kind === 'changed' && 'text-mac-accent',
                      e.kind === 'type' && 'text-mac-warning'
                    )}
                  >
                    {e.kind}
                  </span>
                  <span>{e.path}</span>
                  <DiffValues entry={e} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <footer className="border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={status.tone}>{status.text}</ToolStatus>
      </footer>
    </div>
  )
}

function DiffValues({ entry }: { entry: DiffEntry }): JSX.Element {
  return (
    <span className="text-mac-label-secondary">
      {entry.left !== undefined && <>A: {JSON.stringify(entry.left)} </>}
      {entry.right !== undefined && <>B: {JSON.stringify(entry.right)}</>}
    </span>
  )
}
