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
        'mac-tool-toolbar flex min-h-[48px] shrink-0 flex-wrap items-center gap-x-2 gap-y-2 border-b border-mac-separator bg-mac-surface px-3 py-2.5 sm:px-4',
        className
      )}
    >
      {children}
    </div>
  )
}

export function ToolStatus({
  children,
  tone = 'neutral',
  className
}: {
  children: React.ReactNode
  tone?: 'neutral' | 'success' | 'danger' | 'warning'
  className?: string
}): JSX.Element {
  const color =
    tone === 'success'
      ? 'text-mac-success'
      : tone === 'danger'
        ? 'text-mac-danger'
        : tone === 'warning'
          ? 'text-mac-warning'
          : 'text-mac-label-secondary'

  const dot =
    tone === 'success'
      ? 'bg-mac-success'
      : tone === 'danger'
        ? 'bg-mac-danger'
        : tone === 'warning'
          ? 'bg-mac-warning'
          : 'bg-mac-label-tertiary/50'

  return (
    <span role="status" aria-live="polite" aria-atomic="true" className={cn('inline-flex min-w-0 items-start gap-2 break-words text-[12px] leading-relaxed', color, className)}>
      <span className={cn('mac-status-dot mt-[5px] shrink-0', dot)} aria-hidden />
      <span className={cn('min-w-0 [overflow-wrap:anywhere]', tone === 'neutral' && 'text-mac-label-secondary')}>{children}</span>
    </span>
  )
}
