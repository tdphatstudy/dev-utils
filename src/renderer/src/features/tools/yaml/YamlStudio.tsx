import { useMemo, useState } from 'react'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { TreeView, type JsonValue } from '@renderer/components/ui/TreeView'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import { formatYaml, jsonToYaml, parseYaml, yamlToJson } from '@shared/yaml'
import { useToolDraft } from '@renderer/hooks/useToolDraft'
import { SaveToBoxButton } from '@renderer/features/secret-box/SaveToBoxButton'

const SAMPLE = `name: DevUtils
version: 1
features:
  - yaml
  - json
meta:
  local: true
  privacy: first
`

type ViewMode = 'tree' | 'yaml' | 'json'

export default function YamlStudio(): JSX.Element {
  const [input, setInput] = useState(SAMPLE)
  const [view, setView] = useState<ViewMode>('tree')
  useToolDraft('yaml.studio', input, setInput, { label: 'YAML Studio', historyOnUnmount: true })

  const parsed = useMemo(() => parseYaml(input), [input])
  const formatted = useMemo(() => formatYaml(input), [input])
  const asJson = useMemo(() => yamlToJson(input), [input])

  const treeData: JsonValue | null = parsed.ok ? parsed.value : null
  const yamlOut = formatted.ok ? (formatted.text ?? '') : ''
  const jsonOut = asJson.ok ? (asJson.text ?? '') : ''

  const status = !input.trim()
    ? { tone: 'neutral' as const, text: 'Paste YAML to get started' }
    : parsed.ok
      ? { tone: 'success' as const, text: 'Valid YAML' }
      : {
          tone: 'danger' as const,
          text: `Invalid${parsed.line ? ` · line ${parsed.line}` : ''} — ${parsed.error}`
        }

  const outputCopy =
    view === 'json' ? jsonOut : view === 'yaml' ? yamlOut : input

  return (
    <div className="flex h-full flex-col">
      <ToolToolbar>
        <button
          type="button"
          className="mac-btn-primary"
          onClick={() => {
            if (formatted.ok && formatted.text) setInput(formatted.text)
          }}
        >
          Format
        </button>
        <button
          type="button"
          className="mac-btn-secondary"
          onClick={() => {
            if (asJson.ok && asJson.text) {
              const back = jsonToYaml(asJson.text)
              if (back.ok && back.text) setInput(back.text)
            }
          }}
        >
          Normalize via JSON
        </button>
        <div className="ml-auto flex items-center gap-2">
          <SegmentedControl
            value={view}
            onChange={setView}
            options={[
              { value: 'tree', label: 'Tree' },
              { value: 'yaml', label: 'YAML' },
              { value: 'json', label: 'JSON' }
            ]}
          />
          <SaveToBoxButton
            type={view === 'json' && asJson.ok ? 'json' : 'text'}
            content={
              view === 'json' && asJson.ok
                ? jsonOut
                : formatted.ok
                  ? yamlOut || input
                  : input
            }
            defaultName={
              view === 'json' && asJson.ok
                ? undefined
                : `yaml-${new Date().toISOString().slice(0, 10)}.yaml`
            }
            disabled={!parsed.ok && !!input.trim()}
          />
          <CopyButton text={outputCopy} />
          <button type="button" className="mac-btn-ghost" onClick={() => setInput(SAMPLE)}>
            Sample
          </button>
        </div>
      </ToolToolbar>

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 p-3">
        <CodeEditor value={input} onChange={setInput} language="yaml" placeholder="Paste YAML…" />
        {view === 'tree' ? (
          treeData !== null ? (
            <TreeView data={treeData} />
          ) : (
            <div className="flex items-center justify-center rounded-mac-lg border border-dashed border-mac-separator text-[13px] text-mac-label-tertiary">
              Fix YAML errors to see tree
            </div>
          )
        ) : view === 'json' ? (
          <CodeEditor value={jsonOut} language="json" readOnly />
        ) : (
          <CodeEditor value={yamlOut} language="yaml" readOnly />
        )}
      </div>

      <footer className="flex items-center border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={status.tone}>{status.text}</ToolStatus>
      </footer>
    </div>
  )
}
