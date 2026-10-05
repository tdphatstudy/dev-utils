import { cn } from '@renderer/lib/utils'

/**
 * Responsive dual-pane layout for tools:
 * - narrow: stacked single column with usable min heights
 * - wide workspace: side-by-side 2 columns (independent of sidebar width)
 */
export function SplitPane({
  children,
  className,
  /** When true, omit default padding (caller provides). */
  flush = false,
  onDragOver,
  onDrop
}: {
  children: React.ReactNode
  className?: string
  flush?: boolean
  onDragOver?: React.DragEventHandler<HTMLDivElement>
  onDrop?: React.DragEventHandler<HTMLDivElement>
}): JSX.Element {
  return (
    <div
      className={cn(
        'mac-split-pane grid min-h-0 flex-1 auto-rows-[minmax(160px,1fr)] grid-cols-1 gap-3 overflow-auto',
        !flush && 'p-3',
        '[&>*]:min-h-[160px] [&>*]:min-w-0',
        className
      )}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {children}
    </div>
  )
}
