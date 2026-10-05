import { useState } from 'react'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { SplitPane } from '@renderer/components/ui/SplitPane'
import { TreeView, type JsonValue } from '@renderer/components/ui/TreeView'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import { jsonToYaml, type YamlParseResult } from '@shared/yaml'
import { useYamlAnalysis } from './useYamlAnalysis'
import { useToolDraft } from '@renderer/hooks/useToolDraft'
import { SaveToBoxButton } from '@renderer/features/secret-box/SaveToBoxButton'
import { TextInputActions } from '@renderer/components/ui/TextInputActions'

const SAMPLE = `name: DevFusion
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

  const { analysis, pending } = useYamlAnalysis(input)
  const waiting: YamlParseResult = { ok: false, error: 'Processing YAML…' }
  const parsed = analysis?.parsed ?? waiting
  const formatted = analysis?.formatted ?? waiting
  const asJson = analysis?.asJson ?? waiting

  const treeData: JsonValue | null = parsed.ok ? parsed.value : null
  const yamlOut = formatted.ok ? (formatted.text ?? '') : ''
  const jsonOut = asJson.ok ? (asJson.text ?? '') : ''

  const status = !input.trim()
    ? { tone: 'neutral' as const, text: 'Paste YAML to get started' }
    : pending ? { tone: 'neutral' as const, text: 'Processing YAML…' }
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
          disabled={!input.trim() || !formatted.ok}
          title="Format while preserving YAML comments and aliases"
          onClick={() => {
            if (formatted.ok && formatted.text) setInput(formatted.text)
          }}
        >
          Format
        </button>
        <button
          type="button"
          className="mac-btn-secondary"
          disabled={!input.trim() || !asJson.ok}
          title="Convert through JSON; YAML comments and aliases will be removed"
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
            disabled={!input.trim() || !parsed.ok || (view === 'json' && !asJson.ok)}
          />
          <CopyButton text={outputCopy} />
          <button type="button" className="mac-btn-ghost" onClick={() => setInput(SAMPLE)}>
            Sample
          </button>
        </div>
        <TextInputActions value={input} onChange={setInput} output={view === 'json' ? jsonOut : yamlOut} fileName={view === 'json' ? 'converted.json' : 'formatted.yaml'} accept=".yaml,.yml,.txt" />
      </ToolToolbar>

      <SplitPane>
        <CodeEditor value={input} onChange={setInput} language="yaml" placeholder="Paste YAML…" label="YAML input" issue={pending || !input.trim() || parsed.ok ? null : parsed} onRun={() => { if (formatted.ok && formatted.text) setInput(formatted.text) }} />
        {view === 'tree' ? (
          parsed.ok && asJson.ok ? (
            <TreeView data={treeData} />
          ) : (
            <div className="flex items-center justify-center rounded-mac-lg border border-dashed border-mac-separator text-[13px] text-mac-label-tertiary">
              {pending ? 'Processing YAML…' : input.trim() ? (asJson.ok ? 'Fix the highlighted YAML error to see the tree.' : asJson.error) : 'Paste YAML or open a file to get started.'}
            </div>
          )
        ) : view === 'json' ? (
          <CodeEditor value={jsonOut} language="json" readOnly label="JSON output" issue={input.trim() && !asJson.ok ? asJson : null} />
        ) : (
          <CodeEditor value={yamlOut} language="yaml" readOnly label="Formatted YAML" issue={null} />
        )}
      </SplitPane>

      <footer className="flex items-center border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={status.tone}>{status.text}</ToolStatus>
      </footer>
    </div>
  )
}
