import { useEffect, useState, type ReactNode } from 'react'
import { AppLogo } from '@renderer/components/chrome/AppLogo'
import { cn } from '@renderer/lib/utils'

export function LoadingState({
  label = 'Loading…',
  detail = 'Preparing your workspace.',
  slowDetail = 'This is taking longer than usual.',
  action,
  className
}: {
  label?: string
  detail?: string
  slowDetail?: string
  action?: ReactNode
  className?: string
}): JSX.Element {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    setSlow(false)
    const timer = window.setTimeout(() => setSlow(true), 4000)
    return () => window.clearTimeout(timer)
  }, [label])

  return (
    <div className={cn('mac-loading-state flex h-full min-h-[180px] items-center justify-center overflow-auto px-5 py-6 text-center', className)} data-loading-state>
      <div className="mac-loading-content flex max-w-sm flex-col items-center gap-4">
        <div className="mac-loading-brand" aria-hidden="true">
          <span className="mac-loading-orbit mac-loading-orbit-one" />
          <span className="mac-loading-orbit mac-loading-orbit-two" />
          <AppLogo size={48} className="mac-loading-logo" />
        </div>
        {/* Keep the live status outside a busy region: its slow notice must be announced. */}
        <div role="status" aria-live="polite" aria-atomic="true">
          <p className="text-[15px] font-semibold tracking-tight text-mac-label">{label}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-mac-label-secondary">{slow ? slowDetail : detail}</p>
        </div>
        {action}
      </div>
    </div>
  )
}