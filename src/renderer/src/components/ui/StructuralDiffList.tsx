import type { DiffEntry } from '@shared/json/diff'
import { cn } from '@renderer/lib/utils'

export function StructuralDiffList({ entries }: { entries: DiffEntry[] }): JSX.Element {
  if (entries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-mac-success">
        No differences
      </div>
    )
  }

  return (
    <ul className="divide-y divide-mac-separator font-mono text-[12px]">
      {entries.map((e) => (
        <li
          key={`${e.kind}-${e.path}`}
          className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2 hover:bg-mac-control/50"
        >
          <span
            className={cn(
              'w-16 shrink-0 font-semibold uppercase',
              e.kind === 'added' && 'text-mac-success',
              e.kind === 'removed' && 'text-mac-danger',
              e.kind === 'changed' && 'text-mac-accent',
              e.kind === 'type' && 'text-mac-warning'
            )}
          >
            {e.kind}
          </span>
          <span className="min-w-[120px] text-mac-label">{e.path}</span>
          <span className="text-mac-label-secondary">
            {e.left !== undefined && (
              <span className="mr-2">
                A: <span className="text-mac-label">{JSON.stringify(e.left)}</span>
              </span>
            )}
            {e.right !== undefined && (
              <span>
                B: <span className="text-mac-label">{JSON.stringify(e.right)}</span>
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}
