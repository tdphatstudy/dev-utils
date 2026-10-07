import { t as uiText } from '@renderer/i18n'
import { Children, useEffect, useId, useRef, useState } from 'react'
import { cn } from '@renderer/lib/utils'
import { useI18n } from '@renderer/i18n'

/**
 * Responsive dual-pane layout for tools:
 * - narrow: stacked single column with usable min heights
 * - wide workspace: side-by-side 2 columns (independent of sidebar width)
 */
export function SplitPane({
  children,
  className,
  /** When true, omit default padding (caller provides). */
  flush = false,
  /** Opt in to reachable pane tabs when the workspace is too narrow for a split. */
  labels,
  activePane,
  onPaneChange,
  onDragOver,
  onDrop
}: {
  children: React.ReactNode
  className?: string
  flush?: boolean
  labels?: readonly [string, string]
  activePane?: 0 | 1
  onPaneChange?: (pane: 0 | 1) => void
  onDragOver?: React.DragEventHandler<HTMLDivElement>
  onDrop?: React.DragEventHandler<HTMLDivElement>
}): JSX.Element {
  const { t } = useI18n()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([])
  const [wide, setWide] = useState(false)
  const [localSelected, setLocalSelected] = useState<0 | 1>(0)
  const selected = activePane ?? localSelected
  const setSelected = (pane: 0 | 1): void => { setLocalSelected(pane); onPaneChange?.(pane) }
  const selectionCallback = useRef(onPaneChange)
  selectionCallback.current = onPaneChange
  const wasWide = useRef(false)
  const id = useId()
  const panes = Children.toArray(children)
  const focusPanes = Boolean(labels && panes.length === 2)
  useEffect(() => {
    const element = wrapperRef.current
    if (!focusPanes || !element) return
    const update = (): void => {
      const next = element.clientWidth >= 680
      if (wasWide.current && !next) {
        const panels = element.querySelectorAll<HTMLElement>(':scope > div:last-child > div')
        const focused = [...panels].findIndex((panel) => panel.contains(document.activeElement))
        if (focused === 0 || focused === 1) { setLocalSelected(focused); selectionCallback.current?.(focused) }
      }
      wasWide.current = next
      setWide(next)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [focusPanes])
  useEffect(() => {
    if (wide || !focusPanes) return
    const previousPanel = document.getElementById(`${id}-pane-${1 - selected}`)
    if (previousPanel?.contains(document.activeElement)) buttonsRef.current[selected]?.focus()
  }, [selected, wide, focusPanes, id])
  if (focusPanes && labels) return (
    <div ref={wrapperRef} className="flex min-h-0 min-w-0 flex-1 flex-col">
      {!wide && (
        <div role="tablist" aria-label={uiText('Workspace panes')} className="flex shrink-0 gap-1 border-b border-mac-separator bg-mac-surface px-3 py-1.5">
          {labels.map((label, index) => (
            <button
              key={label}
              ref={(element) => { buttonsRef.current[index] = element }}
              type="button"
              role="tab"
              id={`${id}-tab-${index}`}
              aria-controls={`${id}-pane-${index}`}
              aria-selected={selected === index}
              tabIndex={selected === index ? 0 : -1}
              className={cn('mac-btn-ghost', selected === index && '!bg-mac-accent-soft !text-mac-accent')}
              onClick={() => setSelected(index as 0 | 1)}
              onKeyDown={(event) => {
                const next = event.key === 'ArrowRight' || event.key === 'ArrowLeft' ? 1 - index
                  : event.key === 'Home' ? 0 : event.key === 'End' ? 1 : null
                if (next === null) return
                event.preventDefault()
                setSelected(next as 0 | 1)
                buttonsRef.current[next]?.focus()
              }}
            >{t(label)}</button>
          ))}
        </div>
      )}
      <div
        data-split-pane
        className={cn('grid min-h-0 min-w-0 flex-1 gap-3 overflow-hidden', !flush && 'p-3', className)}
        style={{ gridTemplateColumns: wide ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)', gridTemplateRows: 'minmax(0, 1fr)' }}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {panes.map((pane, index) => (
          <div key={index} id={`${id}-pane-${index}`} role={wide ? 'region' : 'tabpanel'} aria-label={wide ? t(labels[index]) : undefined} aria-labelledby={wide ? undefined : `${id}-tab-${index}`} hidden={!wide && selected !== index} className={cn('flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-mac-lg', !wide && selected !== index && '!hidden')}>
            {wide && <div className="shrink-0 px-1 pb-1.5 text-[12px] font-semibold text-mac-label-secondary">{t(labels[index])}</div>}
            <div className="min-h-0 flex-1">{pane}</div>
          </div>
        ))}
      </div>
    </div>
  )
  return (
    <div
      data-split-pane
      className={cn(
        'mac-split-pane grid min-h-0 flex-1 auto-rows-[minmax(160px,1fr)] grid-cols-1 gap-3 overflow-auto',
        !flush && 'p-3',
        '[&>*]:min-h-[160px] [&>*]:min-w-0',
        className
      )}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {children}
    </div>
  )
}
