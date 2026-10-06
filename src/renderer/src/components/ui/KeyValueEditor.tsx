import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, Undo2 } from 'lucide-react'
import type { KeyValueRow } from '@shared/http/types'
import { newRow } from '@shared/http/build-request'
import { cn } from '@renderer/lib/utils'

interface Props {
  rows: KeyValueRow[]
  onChange: (rows: KeyValueRow[]) => void
  keyPlaceholder?: string
  valuePlaceholder?: string
  className?: string
  labelPrefix?: string
}

export function KeyValueEditor({
  rows,
  onChange,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
  className,
  labelPrefix = 'Row'
}: Props): JSX.Element {
  const inputs = useRef(new Map<string, HTMLInputElement>())
  const addButton = useRef<HTMLButtonElement>(null)
  const pendingFocus = useRef<string | null>(null)
  const [removed, setRemoved] = useState<{ row: KeyValueRow; index: number } | null>(null)
  useEffect(() => {
    if (pendingFocus.current === null) return
    const target = inputs.current.get(pendingFocus.current)
    const focusTarget = target ?? addButton.current
    focusTarget?.focus()
    pendingFocus.current = null
  }, [rows])
  const update = (id: string, patch: Partial<KeyValueRow>): void => {
    setRemoved(null)
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  const remove = (id: string): void => {
    const index = rows.findIndex((row) => row.id === id)
    const row = rows[index]
    if (!row) return
    setRemoved({ row, index })
    pendingFocus.current = rows[index + 1]?.id ?? rows[index - 1]?.id ?? ''
    onChange(rows.filter((r) => r.id !== id))
  }

  const add = (): void => {
    const row = newRow()
    setRemoved(null)
    pendingFocus.current = row.id
    onChange([...rows, row])
  }

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full table-fixed border-collapse text-[13px]" aria-label={`${labelPrefix} fields`}>
          <thead className="sticky top-0 z-10 bg-mac-surface text-[12px] text-mac-label-secondary">
            <tr className="border-b border-mac-separator">
              <th className="w-10 px-2 py-2 font-medium"><span className="sr-only">Enabled</span></th>
              <th className="px-2 py-1.5 text-left font-medium">Key</th>
              <th className="px-2 py-1.5 text-left font-medium">Value</th>
              <th className="w-10 px-1"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id} className="border-b border-mac-separator/70 hover:bg-mac-control/40">
                <td className="px-1 py-1 text-center">
                  <label className="flex min-h-[34px] w-full cursor-pointer items-center justify-center" title={row.enabled ? 'Include this field in the request' : 'Field excluded from the request; enable to include it'}>
                  <input
                    type="checkbox"
                    aria-label={`Enable ${labelPrefix} ${index + 1}`}
                    checked={row.enabled}
                    onChange={(e) => update(row.id, { enabled: e.target.checked })}
                    className="h-4 w-4 accent-mac-accent"
                  />
                  </label>
                </td>
                <td className="px-1 py-0.5">
                  <input
                    ref={(element) => { if (element) inputs.current.set(row.id, element); else inputs.current.delete(row.id) }}
                    className={cn('mac-input !rounded-md !border-transparent !bg-transparent !px-2 !py-1 font-mono focus:!border-[var(--mac-input-border)] focus:!bg-mac-control', !row.enabled && '!text-mac-label-secondary')}
                    value={row.key}
                    aria-label={`${labelPrefix} ${index + 1} key`}
                    placeholder={keyPlaceholder}
                    onChange={(e) => update(row.id, { key: e.target.value })}
                    spellCheck={false}
                  />
                </td>
                <td className="px-1 py-0.5">
                  <input
                    className={cn('mac-input !rounded-md !border-transparent !bg-transparent !px-2 !py-1 font-mono focus:!border-[var(--mac-input-border)] focus:!bg-mac-control', !row.enabled && '!text-mac-label-secondary')}
                    value={row.value}
                    aria-label={`${labelPrefix} ${index + 1} value`}
                    placeholder={valuePlaceholder}
                    onChange={(e) => update(row.id, { value: e.target.value })}
                    spellCheck={false}
                  />
                </td>
                <td className="px-1">
                  <button
                    type="button"
                    className="mac-btn-ghost !p-1 text-mac-label-tertiary hover:text-mac-danger"
                    onClick={() => remove(row.id)}
                    title={`Remove ${labelPrefix.toLowerCase()} ${index + 1} (Undo available)`}
                    aria-label={`Remove ${labelPrefix} ${index + 1}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="px-3 py-6 text-center text-[13px] text-mac-label-secondary">No {labelPrefix === 'Row' ? 'fields' : `${labelPrefix.toLowerCase()} fields`} yet. Add a row to include a key and value.</div>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-mac-separator p-2">
        <button ref={addButton} type="button" className="mac-btn-secondary !text-[13px]" onClick={add}>
          <Plus className="h-3.5 w-3.5" />
          Add row
        </button>
        {removed && <>
          <span className="text-[12px] text-mac-label-secondary" role="status">{labelPrefix} removed.</span>
          <button type="button" className="mac-btn-ghost !text-[13px]" onClick={() => {
            const next = [...rows]
            next.splice(Math.min(removed.index, next.length), 0, removed.row)
            pendingFocus.current = removed.row.id
            setRemoved(null)
            onChange(next)
          }}><Undo2 className="h-3.5 w-3.5" aria-hidden />Undo</button>
        </>}
      </div>
    </div>
  )
}
