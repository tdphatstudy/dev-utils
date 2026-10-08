import { useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@renderer/lib/utils'
import { useShortcut } from '@renderer/shortcuts/useShortcuts'
import { matchesShortcut } from '@shared/shortcuts'
import { useAppStore } from '@renderer/store/app-store'

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
  opener?: HTMLElement
  label?: string
  onSelect: (id: string) => void
  onClose: () => void
}

export function ContextMenu({ x, y, items, opener, label = 'File actions', onSelect, onClose }: Props): JSX.Element {
  const paletteShortcut = useShortcut('app.palette')
  const ref = useRef<HTMLDivElement>(null)
  const callbacks = useRef({ onSelect, onClose })
  callbacks.current = { onSelect, onClose }
  const returnFocus = useRef(opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null))
  const restoreFocus = useRef(true)
  const placement = useRef({ x, y, opener })
  placement.current = { x, y, opener }

  useLayoutEffect(() => {
    const menu = ref.current
    if (!menu) return
    if (opener) returnFocus.current = opener
    restoreFocus.current = true
    const position = (): void => {
      const viewport = window.visualViewport
      const left = (viewport?.offsetLeft ?? 0) + 8
      const top = (viewport?.offsetTop ?? 0) + 8
      const width = Math.max(1, (viewport?.width ?? window.innerWidth) - 16)
      const height = Math.max(1, (viewport?.height ?? window.innerHeight) - 16)
      menu.style.minWidth = `${Math.min(200, width)}px`
      menu.style.maxWidth = `${width}px`
      menu.style.maxHeight = `${height}px`
      const bounds = menu.getBoundingClientRect()
      menu.style.left = `${Math.max(left, Math.min(x, left + width - bounds.width))}px`
      menu.style.top = `${Math.max(top, Math.min(y, top + height - bounds.height))}px`
    }
    position()
    const enabled = menu.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')
    const initialFocus = enabled ?? menu
    initialFocus.focus({ preventScroll: true })
    const resize = new ResizeObserver(position)
    resize.observe(menu)
    window.addEventListener('resize', position)
    window.visualViewport?.addEventListener('resize', position)
    window.visualViewport?.addEventListener('scroll', position)
    const onDown = (event: PointerEvent): void => {
      if (!menu.contains(event.target as Node)) {
        restoreFocus.current = false
        callbacks.current.onClose()
      }
    }
    const onFocus = (event: FocusEvent): void => {
      if (!menu.contains(event.target as Node)) {
        restoreFocus.current = false
        callbacks.current.onClose()
      }
    }
    window.addEventListener('pointerdown', onDown, true)
    document.addEventListener('focusin', onFocus)
    return () => {
      resize.disconnect()
      window.removeEventListener('resize', position)
      window.visualViewport?.removeEventListener('resize', position)
      window.visualViewport?.removeEventListener('scroll', position)
      window.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('focusin', onFocus)
      const active = document.activeElement
      const closing = placement.current.x === x && placement.current.y === y && placement.current.opener === opener
      // A newly opened dialog owns focus; never steal it from that next action.
      if (closing && restoreFocus.current && (active === document.body || menu.contains(active))) {
        returnFocus.current?.isConnected && returnFocus.current.focus({ preventScroll: true })
      }
    }
  }, [x, y, opener])

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (paletteShortcut.enabled && matchesShortcut(event.nativeEvent, paletteShortcut.binding, paletteShortcut.platform)) {
      // Global tool search remains available, but replaces this menu layer.
      restoreFocus.current = false
      if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true })
      callbacks.current.onClose()
      event.preventDefault()
      useAppStore.getState().setCommandOpen(true)
      return
    }
    // The desktop's Enter/Delete/F2 shortcuts must not run behind this layer.
    event.stopPropagation()
    const menu = ref.current
    if (!menu) return
    const enabled = [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')]
    const current = enabled.indexOf(document.activeElement as HTMLButtonElement)
    let next: number | undefined
    if (event.key === 'ArrowDown') next = (current + 1) % enabled.length
    else if (event.key === 'ArrowUp') next = current < 0 ? enabled.length - 1 : (current - 1 + enabled.length) % enabled.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = enabled.length - 1
    else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault()
      callbacks.current.onClose()
      return
    }
    if (next != null) {
      event.preventDefault()
      enabled[next]?.focus({ preventScroll: true })
      enabled[next]?.scrollIntoView({ block: 'nearest' })
    }
  }

  // Workspace container queries establish a containing block. Portaling keeps
  // fixed coordinates relative to the viewport, including with an open sidebar.
  return createPortal(
    <div
      ref={ref}
      style={{ left: x, top: y }}
      className="fixed z-[220] overflow-y-auto overflow-x-hidden rounded-mac border border-mac-separator bg-mac-surface py-1 shadow-mac-lg"
      role="menu"
      aria-label={label}
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      {items.map((item) =>
        item.separator ? (
          <div key={item.id} role="separator" className="my-1 border-t border-mac-separator" />
        ) : (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            tabIndex={-1}
            disabled={item.disabled}
            className={cn(
              'flex min-h-[34px] w-full items-center justify-between gap-6 px-3 py-1.5 text-left text-[13px] focus-visible:!outline-offset-[-2px]',
              item.disabled
                ? 'cursor-not-allowed text-mac-label-tertiary'
                : item.danger
                  ? 'text-mac-danger hover:bg-mac-danger/10'
                  : 'text-mac-label hover:bg-mac-accent-fill hover:text-white'
            )}
            onClick={() => {
              if (item.disabled) return
              // Dialogs opened by an action must capture the stable file/folder
              // opener, rather than this menu item that is about to unmount.
              restoreFocus.current = false
              if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true })
              callbacks.current.onSelect(item.id)
              callbacks.current.onClose()
            }}
          >
            <span className="min-w-0 break-words">{item.label}</span>
            {item.shortcut && (
              <span className="shrink-0 font-mono text-[11px]">{item.shortcut}</span>
            )}
          </button>
        )
      )}
    </div>,
    document.body
  )
}
