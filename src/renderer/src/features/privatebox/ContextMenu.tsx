import { useEffect, useRef } from 'react'
import { cn } from '@renderer/lib/utils'

export interface ContextMenuItem {
  id: string
  label: string
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  separator?: boolean
}

interface Props {
  x: number
  y: number
  items: ContextMenuItem[]
  onSelect: (id: string) => void
  onClose: () => void
}

export function ContextMenu({ x, y, items, onSelect, onClose }: Props): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  // keep menu on screen
  const style: React.CSSProperties = {
    left: Math.min(x, window.innerWidth - 220),
    top: Math.min(y, window.innerHeight - 280)
  }

  return (
    <div
      ref={ref}
      style={style}
      className="fixed z-[220] min-w-[200px] overflow-hidden rounded-mac border border-mac-separator bg-mac-surface/95 py-1 shadow-mac-lg backdrop-blur-xl"
      role="menu"
    >
      {items.map((item) =>
        item.separator ? (
          <div key={item.id} className="my-1 border-t border-mac-separator" />
        ) : (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            className={cn(
              'flex w-full items-center justify-between gap-6 px-3 py-1.5 text-left text-[13px]',
              item.disabled
                ? 'cursor-not-allowed text-mac-label-tertiary'
                : item.danger
                  ? 'text-mac-danger hover:bg-mac-danger/10'
                  : 'text-mac-label hover:bg-mac-accent hover:text-white'
            )}
            onClick={() => {
              if (item.disabled) return
              onSelect(item.id)
              onClose()
            }}
          >
            <span>{item.label}</span>
            {item.shortcut && (
              <span className="font-mono text-[10px] opacity-60">{item.shortcut}</span>
            )}
          </button>
        )
      )}
    </div>
  )
}
