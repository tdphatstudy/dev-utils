import { cn } from '@renderer/lib/utils'

export function ToolToolbar({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}): JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 border-b border-mac-separator bg-mac-surface/50 px-4 py-2',
        className
      )}
    >
      {children}
    </div>
  )
}

export function ToolStatus({
  children,
  tone = 'neutral'
}: {
  children: React.ReactNode
  tone?: 'neutral' | 'success' | 'danger' | 'warning'
}): JSX.Element {
  const color =
    tone === 'success'
      ? 'text-mac-success'
      : tone === 'danger'
        ? 'text-mac-danger'
        : tone === 'warning'
          ? 'text-mac-warning'
          : 'text-mac-label-secondary'
  return <span className={cn('text-[12px]', color)}>{children}</span>
}
