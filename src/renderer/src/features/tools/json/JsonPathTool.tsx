import { useMemo, useState } from 'react'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { SplitPane } from '@renderer/components/ui/SplitPane'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import { parseJson } from '@shared/json'
import { queryJsonPath } from '@shared/json/path'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { TextInputActions } from '@renderer/components/ui/TextInputActions'

const SAMPLE = `{
  "store": {
    "book": [
      { "category": "ref", "title": "Sayings", "price": 8.95 },
      { "category": "fiction", "title": "Sword", "price": 12.99 }
    ],
    "bicycle": { "color": "red", "price": 19.95 }
  }
}`

export default function JsonPathTool(): JSX.Element {
  const [json, setJson] = useState(SAMPLE)
  const [path, setPath] = useState('$.store.book[*].title')
  const [outputMode, setOutputMode] = useState<'matches' | 'values' | 'paths'>('matches')

  const parsed = useMemo(() => parseJson(json), [json])
  const result = useMemo(() => {
    if (!parsed.ok) return null
    return queryJsonPath(parsed.value, path)
  }, [parsed, path])

  const output =
    result?.ok
      ? JSON.stringify(
          outputMode === 'values' ? result.values : outputMode === 'paths' ? result.paths : result.values.map((value, i) => ({ path: result.paths[i], value })),
          null,
          2
        )
      : ''

  const status = !json.trim()
    ? { tone: 'neutral' as const, text: 'Paste JSON or open a file to query.' }
    : !parsed.ok
    ? { tone: 'danger' as const, text: parsed.error }
    : !result
      ? { tone: 'neutral' as const, text: '—' }
      : !result.ok
        ? { tone: 'danger' as const, text: result.error }
        : {
            tone: result.values.length ? 'success' as const : 'neutral' as const,
            text: result.values.length ? `${result.values.length} match${result.values.length === 1 ? '' : 'es'}` : 'No matches. Check the key names and array indexes in your path.'
          }

  return (
    <div className="flex h-full flex-col">
      <ToolToolbar>
        <input
          className="mac-input max-w-md font-mono"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="$.path.to[*].value"
          spellCheck={false}
          aria-label="JSONPath expression"
          aria-invalid={!!result && !result.ok}
        />
        <div className="flex gap-1">
          {['$.store.book[0]', '$.store.book[*].price', '$..price'].map((p) => (
            <button key={p} type="button" className="mac-btn-ghost !text-[11px]" onClick={() => setPath(p)}>
              {p}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <CopyButton text={output} label="Copy results" />
        </div>
        <SegmentedControl value={outputMode} onChange={setOutputMode} options={[{ value: 'matches', label: 'Paths + values' }, { value: 'values', label: 'Values' }, { value: 'paths', label: 'Paths' }]} />
        <TextInputActions value={json} onChange={setJson} output={output} fileName="query-results.json" accept=".json,.txt" />
      </ToolToolbar>

      <SplitPane>
        <CodeEditor value={json} onChange={setJson} language="json" label="JSON input" issue={!json.trim() || parsed.ok ? null : parsed} />
        <CodeEditor value={output} language="json" readOnly label="Query results" />
      </SplitPane>

      <footer className="flex items-center border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={status.tone}>{status.text}</ToolStatus>
        <span className="ml-auto text-[11px] text-mac-label-tertiary">
          Supports $, .key, [n], [-n], [*], ["key"], ..key · no filters
        </span>
      </footer>
    </div>
  )
}
