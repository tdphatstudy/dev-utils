import { useMemo, useState } from 'react'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { SplitPane } from '@renderer/components/ui/SplitPane'
import { TreeView, type JsonValue } from '@renderer/components/ui/TreeView'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import { formatJson } from '@shared/json'
import { TextInputActions } from '@renderer/components/ui/TextInputActions'
import { useToolDraft } from '@renderer/hooks/useToolDraft'
import { SaveToBoxButton } from '@renderer/features/secret-box/SaveToBoxButton'

const SAMPLE = `{
  "name": "DevUtils",
  "version": 1,
  "features": ["json", "yaml", "security"],
  "meta": { "local": true, "privacy": "first" }
}`

type ViewMode = 'tree' | 'raw'

export default function JsonStudio(): JSX.Element {
  const [input, setInput] = useState(SAMPLE)
  const [indent, setIndent] = useState(2)
  const [sortKeys, setSortKeys] = useState(false)
  const [view, setView] = useState<ViewMode>('tree')
  useToolDraft('json.studio', input, setInput, { label: 'JSON Studio', historyOnUnmount: true })

  const result = useMemo(() => formatJson(input, { indent, sortKeys }), [input, indent, sortKeys])

  const outputText = result.ok ? (result.text ?? '') : ''
  const treeData: JsonValue = result.ok ? result.value : null

  const status = !input.trim()
    ? { tone: 'neutral' as const, text: 'Paste JSON to get started' }
    : result.ok
      ? {
          tone: 'success' as const,
          text: `Valid · ${outputText.length.toLocaleString()} chars`
        }
      : {
          tone: 'danger' as const,
          text: `Invalid${result.line ? ` · line ${result.line}` : ''}${result.column ? `:${result.column}` : ''} — ${result.error}`
        }

  return (
    <div className="flex h-full flex-col">
      <ToolToolbar>
        <button type="button" className="mac-btn-primary" disabled={!input.trim() || !result.ok} title="Format JSON (Ctrl/⌘ + Enter in the input editor)" onClick={() => {
          if (result.ok && result.text) setInput(result.text)
        }}>
          Format
        </button>
        <button
          type="button"
          className="mac-btn-secondary"
          disabled={!input.trim() || !result.ok}
          onClick={() => {
            const r = formatJson(input, { minify: true })
            if (r.ok && r.text) setInput(r.text)
          }}
        >
          Minify
        </button>
        <label className="flex items-center gap-1.5 text-[12px] text-mac-label-secondary">
          Indent
          <select
            className="mac-input !w-auto !py-1"
            value={indent}
            onChange={(e) => setIndent(Number(e.target.value))}
          >
            <option value={2}>2</option>
            <option value={4}>4</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[12px] text-mac-label-secondary">
          <input
            type="checkbox"
            checked={sortKeys}
            onChange={(e) => setSortKeys(e.target.checked)}
            className="accent-mac-accent"
          />
          Sort keys
        </label>
        <div className="ml-auto flex items-center gap-2">
          <SegmentedControl
            value={view}
            onChange={setView}
            options={[
              { value: 'tree', label: 'Tree' },
              { value: 'raw', label: 'Raw' }
            ]}
          />
          <SaveToBoxButton
            type="json"
            content={result.ok ? outputText || input : input}
            disabled={!input.trim() || !result.ok}
          />
          <CopyButton text={outputText} label="Copy output" />
          <button type="button" className="mac-btn-ghost" onClick={() => setInput(SAMPLE)}>
            Sample
          </button>
        </div>
        <TextInputActions value={input} onChange={setInput} output={outputText} fileName="formatted.json" accept=".json,.txt,application/json" />
      </ToolToolbar>

      <SplitPane>
        <CodeEditor
          value={input}
          onChange={setInput}
          language="json"
          placeholder="Paste JSON…"
          label="JSON input"
          issue={!input.trim() || result.ok ? null : result}
          onRun={() => { if (result.ok && result.text) setInput(result.text) }}
        />
        {view === 'tree' ? (
          result.ok ? (
            <TreeView data={treeData} />
          ) : (
            <div className="flex items-center justify-center rounded-mac-lg border border-dashed border-mac-separator text-[13px] text-mac-label-tertiary">
              {input.trim() ? 'Fix the highlighted error in the input to see the tree.' : 'Paste JSON or open a file to explore its structure.'}
            </div>
          )
        ) : (
          <CodeEditor value={outputText} language="json" readOnly label="Formatted output" />
        )}
      </SplitPane>

      <footer className="flex items-center border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={status.tone}>{status.text}</ToolStatus>
      </footer>
    </div>
  )
}
