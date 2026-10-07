import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useMemo, useState } from 'react'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { TreeView, type JsonValue } from '@renderer/components/ui/TreeView'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { formatJson, parseJson } from '@shared/json'
import { cn } from '@renderer/lib/utils'

interface Props {
  value: string
  onChange: (value: string) => void
  className?: string
}

type ViewMode = 'edit' | 'tree' | 'split'

export function JsonFileEditor({ value, onChange, className }: Props): JSX.Element {
  useUiLocale()
  const [indent, setIndent] = useState(2)
  const [sortKeys, setSortKeys] = useState(false)
  const [view, setView] = useState<ViewMode>('split')

  const parsed = useMemo(() => parseJson(value || '{}'), [value])
  const formatted = useMemo(
    () => formatJson(value || '{}', { indent, sortKeys }),
    [value, indent, sortKeys]
  )

  const treeData: JsonValue | null = parsed.ok ? parsed.value : null
  const status = !value.trim()
    ? { tone: 'neutral' as const, text: 'Empty JSON' }
    : parsed.ok
      ? { tone: 'success' as const, text: 'Valid JSON' }
      : {
          tone: 'danger' as const,
          text: `Invalid${parsed.line ? ` · L${parsed.line}` : ''}${parsed.column ? `:${parsed.column}` : ''} — ${parsed.error}`
        }

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-mac-separator px-2 py-1.5">
        <button
          type="button"
          className="mac-btn-primary !text-[11px]"
          onClick={() => {
            if (formatted.ok && formatted.text) onChange(formatted.text)
          }}
        >
          {uiText('Format')}</button>
        <button
          type="button"
          className="mac-btn-secondary !text-[11px]"
          onClick={() => {
            const r = formatJson(value, { minify: true })
            if (r.ok && r.text) onChange(r.text)
          }}
        >
          {uiText('Minify')}</button>
        <label className="flex items-center gap-1 text-[11px] text-mac-label-secondary">
          {uiText('Indent')}<select
            className="mac-input !w-auto !py-0.5 !text-[11px]"
            value={indent}
            onChange={(e) => setIndent(Number(e.target.value))}
          >
            <option value={2}>2</option>
            <option value={4}>4</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-[11px] text-mac-label-secondary">
          <input
            type="checkbox"
            checked={sortKeys}
            onChange={(e) => setSortKeys(e.target.checked)}
            className="accent-mac-accent"
          />
          {uiText('Sort keys')}</label>
        <SegmentedControl
          value={view}
          onChange={setView}
          options={[
            { value: 'edit', label: 'Edit' },
            { value: 'tree', label: uiText('Tree') },
            { value: 'split', label: uiText('Split') }
          ]}
        />
        <div className="ml-auto">
          <CopyButton text={value} label={uiText('Copy')} className="!text-[11px]" />
        </div>
      </div>

      <div
        className={cn(
          'grid min-h-0 flex-1 gap-2 p-2',
          view === 'split' ? 'grid-cols-2' : 'grid-cols-1'
        )}
      >
        {(view === 'edit' || view === 'split') && (
          <CodeEditor value={value} onChange={onChange} language="json" className="min-h-0" />
        )}
        {(view === 'tree' || view === 'split') &&
          (treeData !== null ? (
            <TreeView data={treeData} className="min-h-0" />
          ) : (
            <div className="flex items-center justify-center rounded-mac-lg border border-dashed border-mac-separator text-[12px] text-mac-label-tertiary">
              Fix JSON to show tree
            </div>
          ))}
      </div>

      <div
        className={cn(
          'shrink-0 border-t border-mac-separator px-3 py-1.5 text-[11px]',
          status.tone === 'success' && 'text-mac-success',
          status.tone === 'danger' && 'text-mac-danger',
          status.tone === 'neutral' && 'text-mac-label-tertiary'
        )}
      >
        {status.text}
      </div>
    </div>
  )
}
