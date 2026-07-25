import { cn } from '@renderer/lib/utils'
import logoUrl from '@renderer/assets/logo.png'
import logoSvg from '@renderer/assets/logo.svg'

interface Props {
  size?: number
  className?: string
  showWordmark?: boolean
  /**
   * `auto` — PNG for large (rich lighting), SVG for tiny (crisp glyph)
   * `png` / `svg` — force a specific asset
   */
  variant?: 'auto' | 'svg' | 'png'
}

/**
 * Apple-like continuous corner radius ≈ 22.37% of side
 * (matches macOS / iOS icon mask proportion).
 */
const APPLE_CORNER = 0.2237

export function AppLogo({
  size = 28,
  className,
  showWordmark = false,
  variant = 'auto'
}: Props): JSX.Element {
  // PNG master already includes squircle + lighting (use for ≥40px / About / dock-like)
  // SVG is a crisp flat match for tiny chrome (title bar, sidebar)
  const usePng = variant === 'png' || (variant === 'auto' && size >= 40)
  const src = usePng ? logoUrl : logoSvg
  // SVG is square full art; light continuous-corner clip. PNG already has alpha squircle.
  const radius = usePng ? 0 : Math.round(size * APPLE_CORNER * 10) / 10

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
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
          borderRadius: radius,
          // Soft modern lift (no heavy plastic shadow)
          boxShadow:
            size >= 48
              ? '0 4px 14px rgba(30, 50, 120, 0.16)'
              : size >= 28
                ? '0 1px 2px rgba(30, 50, 120, 0.1)'
                : undefined
        }}
      />
      {showWordmark && (
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[13px] font-semibold tracking-[-0.01em] text-mac-label">
            DevUtils
          </div>
          <div className="truncate text-[10px] font-medium tracking-wide text-mac-label-tertiary">
            Local tools
          </div>
        </div>
      )}
    </div>
  )
}
