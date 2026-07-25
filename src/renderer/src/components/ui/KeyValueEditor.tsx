import { Plus, Trash2 } from 'lucide-react'
import type { KeyValueRow } from '@shared/http/types'
import { newRow } from '@shared/http/build-request'
import { cn } from '@renderer/lib/utils'

interface Props {
  rows: KeyValueRow[]
  onChange: (rows: KeyValueRow[]) => void
  keyPlaceholder?: string
  valuePlaceholder?: string
  className?: string
}

export function KeyValueEditor({
  rows,
  onChange,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
  className
}: Props): JSX.Element {
  const update = (id: string, patch: Partial<KeyValueRow>): void => {
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  const remove = (id: string): void => {
    onChange(rows.filter((r) => r.id !== id))
  }

  const add = (): void => {
    onChange([...rows, newRow()])
  }

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-[12.5px]">
          <thead className="sticky top-0 bg-mac-surface text-[11px] uppercase tracking-wider text-mac-label-tertiary">
            <tr className="border-b border-mac-separator">
              <th className="w-8 px-2 py-1.5 font-medium" />
              <th className="px-2 py-1.5 text-left font-medium">Key</th>
              <th className="px-2 py-1.5 text-left font-medium">Value</th>
              <th className="w-8 px-1" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-mac-separator/70 hover:bg-mac-control/40">
                <td className="px-2 py-1 text-center">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onChange={(e) => update(row.id, { enabled: e.target.checked })}
                    className="accent-mac-accent"
                  />
                </td>
                <td className="px-1 py-0.5">
                  <input
                    className="mac-input !rounded-md !border-transparent !bg-transparent !px-2 !py-1 font-mono focus:!border-mac-separator focus:!bg-mac-control"
                    value={row.key}
                    placeholder={keyPlaceholder}
                    onChange={(e) => update(row.id, { key: e.target.value })}
                    spellCheck={false}
                  />
                </td>
                <td className="px-1 py-0.5">
                  <input
                    className="mac-input !rounded-md !border-transparent !bg-transparent !px-2 !py-1 font-mono focus:!border-mac-separator focus:!bg-mac-control"
                    value={row.value}
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
                    title="Remove"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="px-3 py-6 text-center text-[12px] text-mac-label-tertiary">No rows</div>
        )}
      </div>
      <div className="shrink-0 border-t border-mac-separator p-2">
        <button type="button" className="mac-btn-secondary !text-[12px]" onClick={add}>
          <Plus className="h-3.5 w-3.5" />
          Add row
        </button>
      </div>
    </div>
  )
}
