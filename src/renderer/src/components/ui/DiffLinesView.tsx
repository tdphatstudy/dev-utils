import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useMemo } from 'react'
import { diffLines, type LineDiffKind } from '@shared/text/line-diff'
import { cn } from '@renderer/lib/utils'

interface Props {
  left: string
  right: string
  leftLabel?: string
  rightLabel?: string
  className?: string
}

export function DiffLinesView({
  left,
  right,
  leftLabel = 'A',
  rightLabel = 'B',
  className
}: Props): JSX.Element {
  useUiLocale()
  const result = useMemo(() => diffLines(left, right), [left, right])

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden rounded-mac-lg border border-mac-separator bg-mac-surface',
        className
      )}
    >
      <div className="grid shrink-0 grid-cols-2 border-b border-mac-separator text-[11px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
        <div className="border-r border-mac-separator px-3 py-1.5">{leftLabel}</div>
        <div className="px-3 py-1.5">{rightLabel}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto font-mono text-[12px] leading-[1.55]">
        {result.pairs.length === 0 ? (
          <div className="flex h-full items-center justify-center text-mac-label-tertiary">{uiText('Empty')}</div>
        ) : (
          result.pairs.map((pair, idx) => (
            <div key={idx} className="grid grid-cols-2">
              <LineCell side={pair.left} gutterBorder />
              <LineCell side={pair.right} />
            </div>
          ))
        )}
      </div>
      <div className="flex shrink-0 gap-3 border-t border-mac-separator px-3 py-1.5 text-[11px] text-mac-label-secondary">
        <span className="text-mac-success">+{result.added}</span>
        <span className="text-mac-danger">−{result.removed}</span>
        <span className="text-mac-label-tertiary">={result.unchanged}</span>
      </div>
    </div>
  )
}

function LineCell({
  side,
  gutterBorder
}: {
  side: { line: number | null; text: string; kind: LineDiffKind } | null
  gutterBorder?: boolean
}): JSX.Element {
  useUiLocale()
  if (!side) {
    return (
      <div
        className={cn(
          'min-h-[22px] bg-mac-control/30',
          gutterBorder && 'border-r border-mac-separator'
        )}
      />
    )
  }

  const bg =
    side.kind === 'add'
      ? 'bg-emerald-500/15 text-mac-label'
      : side.kind === 'remove'
        ? 'bg-red-500/15 text-mac-label'
        : 'bg-transparent text-mac-label'

  const gutter =
    side.kind === 'add'
      ? 'text-mac-success'
      : side.kind === 'remove'
        ? 'text-mac-danger'
        : 'text-mac-label-tertiary'

  const marker = side.kind === 'add' ? '+' : side.kind === 'remove' ? '−' : ' '

  return (
    <div
      className={cn(
        'flex min-h-[22px]',
        bg,
        gutterBorder && 'border-r border-mac-separator'
      )}
    >
      <span className={cn('w-10 shrink-0 select-none px-1 text-right tabular-nums', gutter)}>
        {side.line ?? ''}
      </span>
      <span className={cn('w-4 shrink-0 select-none text-center', gutter)}>{marker}</span>
      <pre className="selectable min-w-0 flex-1 overflow-x-auto whitespace-pre px-1">{side.text || ' '}</pre>
    </div>
  )
}
