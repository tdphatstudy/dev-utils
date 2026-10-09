import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { cn } from '@renderer/lib/utils'
import logoSvg from '@renderer/assets/logo.svg'
import dangerLogoSvg from '@renderer/assets/logo-danger.svg'
import { APP_NAME } from '@shared/brand'

interface Props {
  tone?: 'default' | 'danger'
  size?: number
  className?: string
  showWordmark?: boolean
  /** Prefer svg (default) — avoids decoding a ~500KB PNG into GPU/RAM for chrome */
  variant?: 'svg' | 'png'
  /** Optional PNG url when variant=png (import only on About / large surfaces) */
  pngSrc?: string
}

const APPLE_CORNER = 0.2237

export function AppLogo({
  tone = 'default',
  size = 28,
  className,
  showWordmark = false,
  variant = 'svg',
  pngSrc
}: Props): JSX.Element {
  useUiLocale()
  const usePng = variant === 'png' && !!pngSrc
  const src = tone === 'danger' ? dangerLogoSvg : usePng ? pngSrc! : logoSvg
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
        decoding="async"
        style={{
          width: size,
          height: size,
          objectFit: 'contain',
          aspectRatio: '1',
          borderRadius: radius,
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
            {APP_NAME}
          </div>
          <div className="truncate text-[10px] font-medium tracking-wide text-mac-label-tertiary">
            {uiText('Local developer tools')}</div>
        </div>
      )}
    </div>
  )
}
