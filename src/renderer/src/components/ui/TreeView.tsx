import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn, copyText } from '@renderer/lib/utils'
import {
  collectExpandablePaths,
  flattenJsonTree,
  type FlatTreeRow
} from '@shared/json/flatten-tree'

export type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue }

const ROW_HEIGHT = 26
const OVERSCAN = 12

interface TreeViewProps {
  data: JsonValue
  className?: string
  showControls?: boolean
}

export function TreeView({ data, className, showControls = true }: TreeViewProps): JSX.Element {
  const [openPaths, setOpenPaths] = useState<Set<string>>(() => new Set())
  const [filter, setFilter] = useState('')
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(400)
  const [copyStatus, setCopyStatus] = useState<string | null>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setOpenPaths(new Set())
    setScrollTop(0)
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0
  }, [data])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight))
    ro.observe(el)
    setViewportH(el.clientHeight)
    return () => ro.disconnect()
  }, [])

  const rows = useMemo(() => flattenJsonTree(data, openPaths, { defaultOpenDepth: 2, maxRows: 10000 }), [data, openPaths])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        r.path.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        (r.leafText?.toLowerCase().includes(q) ?? false)
    )
  }, [rows, filter])

  const totalH = filtered.length * ROW_HEIGHT
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const visibleCount = Math.ceil(viewportH / ROW_HEIGHT) + OVERSCAN * 2
  const end = Math.min(filtered.length, start + visibleCount)
  const slice = filtered.slice(start, end)
  const offsetY = start * ROW_HEIGHT

  const toggle = useCallback((path: string, currentlyOpen: boolean) => {
    setOpenPaths((prev) => {
      const next = new Set(prev)
      if (currentlyOpen) {
        next.delete(path)
        next.add(`__closed__:${path}`)
      } else {
        next.delete(`__closed__:${path}`)
        next.add(path)
      }
      return next
    })
  }, [])

  const expandAll = (): void => {
    const paths = collectExpandablePaths(data, 8)
    setOpenPaths(new Set(paths))
  }

  const collapseAll = (): void => {
    const paths = collectExpandablePaths(data, 0)
    const closed = new Set(paths.map((p) => `__closed__:${p}`))
    setOpenPaths(closed)
  }

  const copyPath = async (path: string): Promise<void> => {
    try {
      await copyText(path)
      setCopyStatus('Path copied')
    } catch {
      setCopyStatus('Copy failed. Check clipboard access and try again.')
    }
  }

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden rounded-mac-lg border border-mac-separator bg-mac-surface',
        className
      )}
    >
      {showControls && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-mac-separator px-2 py-1.5">
          <input
            className="mac-input !py-1 text-[12px]"
            placeholder="Filter path / value…"
            aria-label="Filter JSON tree by path or value"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <button type="button" className="mac-btn-ghost !text-[11px] !py-1" onClick={expandAll}>
            Expand
          </button>
          <button type="button" className="mac-btn-ghost !text-[11px] !py-1" onClick={collapseAll}>
            Collapse
          </button>
          <span className="ml-auto text-[10px] text-mac-label-tertiary">
            {filtered.length.toLocaleString()} rows
          </span>
        </div>
      )}
      <div
        ref={scrollerRef}
        className="selectable min-h-0 flex-1 overflow-auto font-mono text-[12.5px]"
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        <div style={{ height: totalH, position: 'relative' }}>
          <div style={{ transform: `translateY(${offsetY}px)` }}>
            {slice.map((row) => (
              <TreeRow key={row.id} row={row} onToggle={toggle} onCopyPath={copyPath} />
            ))}
          </div>
        </div>
      </div>
      {copyStatus && <p role="status" className="shrink-0 border-t border-mac-separator px-3 py-2 text-[12px] text-mac-label-secondary">{copyStatus}</p>}
      {rows.length >= 10000 && <p role="status" className="shrink-0 px-3 py-2 text-[12px] text-mac-label-secondary">Showing up to 10,000 tree rows. Collapse branches or use Raw to view the full document.</p>}
    </div>
  )
}

function TreeRow({
  row,
  onToggle,
  onCopyPath
}: {
  row: FlatTreeRow
  onToggle: (path: string, open: boolean) => void
  onCopyPath: (path: string) => Promise<void>
}): JSX.Element {
  return (
    <div
      className="flex items-center gap-1 rounded px-1 hover:bg-mac-control"
      style={{ height: ROW_HEIGHT, paddingLeft: 8 + row.depth * 14 }}
    >
      {row.isExpandable ? (
        <button
          type="button"
          className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-mac-label-tertiary"
          onClick={() => onToggle(row.path, row.isOpen)}
          aria-expanded={row.isOpen}
          aria-label={`${row.isOpen ? 'Collapse' : 'Expand'} ${row.isRoot ? 'root' : row.path}`}
        >
          {row.isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
      ) : (
        <span className="w-3.5 shrink-0" />
      )}

      {!row.isRoot ? (
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); void onCopyPath(row.path) }}
          className={cn(
            'shrink-0 hover:text-mac-accent',
            row.isExpandable ? 'font-medium text-mac-label-secondary' : 'text-mac-label-secondary'
          )}
          title={`Copy path: ${row.path}`}
        >
          {row.name}
        </button>
      ) : (
        <span className="font-medium text-mac-label-secondary">root</span>
      )}

      {!row.isExpandable && <span className="text-mac-label-tertiary">:</span>}

      {row.leafText !== null && (
        <span className={cn('min-w-0 truncate', leafColor(row.typeLabel))} title={row.leafText}>
          {row.leafText}
        </span>
      )}

      {row.preview && <span className="text-mac-label-tertiary">{row.preview}</span>}

      <span className="ml-1 shrink-0 text-[10px] text-mac-label-tertiary">{row.typeLabel}</span>
    </div>
  )
}

function leafColor(typeLabel: string): string {
  if (typeLabel === 'string') return 'text-mac-success'
  if (typeLabel === 'number') return 'text-mac-accent'
  if (typeLabel === 'boolean') return 'text-mac-warning'
  if (typeLabel === 'null') return 'text-mac-label-tertiary'
  return 'text-mac-label'
}
