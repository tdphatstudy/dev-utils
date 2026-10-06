import { ChevronDown } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

export function ToolToolbar({
  children,
  className,
  label
}: {
  children: React.ReactNode
  className?: string
  label?: string
}): JSX.Element {
  return (
    <div
      role={label ? 'group' : undefined}
      aria-label={label}
      className={cn(
        'mac-tool-toolbar flex min-h-[48px] shrink-0 flex-wrap items-center gap-x-2 gap-y-2 border-b border-mac-separator bg-mac-surface px-3 py-2.5 sm:px-4',
        className
      )}
    >
      {children}
    </div>
  )
}

/** Native disclosure keeps secondary actions discoverable without a permanent extra row. */
export function ToolOptions({ label = 'Options', children }: { label?: string; children: React.ReactNode }): JSX.Element {
  return (
    <details className="group min-w-0 max-w-full open:w-full">
      <summary className="mac-btn-ghost cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        {label}<ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-mac-separator pt-2" role="group" aria-label={label}>
        {children}
      </div>
    </details>
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
