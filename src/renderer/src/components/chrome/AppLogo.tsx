import { cn } from '@renderer/lib/utils'
import logoUrl from '@renderer/assets/logo.png'
import logoSvg from '@renderer/assets/logo.svg'

interface Props {
  size?: number
  className?: string
  showWordmark?: boolean
  variant?: 'svg' | 'png'
}

export function AppLogo({
  size = 28,
  className,
  showWordmark = false,
  variant = 'svg'
}: Props): JSX.Element {
  const src = variant === 'png' ? logoUrl : logoSvg

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <img
        src={src}
        width={size}
        height={size}
        alt=""
        aria-hidden
        draggable={false}
        className="shrink-0 select-none"
        style={{
          width: size,
          height: size,
          borderRadius: variant === 'png' ? '22.3%' : undefined
        }}
      />
      {showWordmark && (
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[13px] font-semibold tracking-tight text-mac-label">
            DevUtils
          </div>
          <div className="truncate text-[10px] text-mac-label-tertiary">Local developer tools</div>
        </div>
      )}
    </div>
  )
}
