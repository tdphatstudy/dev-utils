import { cn } from '@renderer/lib/utils'

/**
 * Responsive dual-pane layout for tools:
 * - narrow: stacked single column with usable min heights
 * - md+: side-by-side 2 columns
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
        'grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-2',
        !flush && 'p-3',
        '[&>*]:min-h-[160px] [&>*]:min-w-0 md:[&>*]:min-h-0',
        className
      )}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {children}
    </div>
  )
}
