import { cn } from '@renderer/lib/utils'

export function LoadingState({
  label = 'Loading…',
  className
}: {
  label?: string
  className?: string
}): JSX.Element {
  return (
    <div
      className={cn(
        'flex h-full min-h-[120px] flex-col items-center justify-center gap-3 px-4 text-center text-mac-label-secondary',
        className
      )}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-busy="true"
    >
      <div className="mac-spinner" aria-hidden />
      <span className="text-[13px] tracking-tight">{label}</span>
    </div>
  )
}
