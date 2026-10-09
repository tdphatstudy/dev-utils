import { messageKey } from '@shared/i18n/message-key'
import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useMemo, useState } from 'react'
import { Undo2 } from 'lucide-react'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { SplitPane } from '@renderer/components/ui/SplitPane'
import { TreeView, type JsonValue } from '@renderer/components/ui/TreeView'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { ToolOptions, ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import { formatJson } from '@shared/json'
import { TextInputActions } from '@renderer/components/ui/TextInputActions'
import { useToolDraft } from '@renderer/hooks/useToolDraft'
import { SaveToBoxButton } from '@renderer/features/secret-box/SaveToBoxButton'
import { useShortcut } from '@renderer/shortcuts/useShortcuts'
import { formatShortcut } from '@shared/shortcuts'

const SAMPLE = `{
  "name": "DevFusion",
  "version": 1,
  "features": ["json", "yaml", "security"],
  "meta": { "local": true, "privacy": "first" }
}`

type ViewMode = 'tree' | 'raw'

export default function JsonStudio(): JSX.Element {
  const runShortcut = useShortcut('editor.run')
  useUiLocale()
  const [input, setInput] = useState(SAMPLE)
  const [indent, setIndent] = useState(2)
  const [sortKeys, setSortKeys] = useState(false)
  const [view, setView] = useState<ViewMode>('tree')
  const [undo, setUndo] = useState<{ value: string; action: string } | null>(null)
  useToolDraft('json.studio', input, setInput, { label: messageKey('JSON Studio'), historyOnUnmount: true })

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
          text: `Invalid JSON${result.line ? ` · line ${result.line}` : ''}${result.column ? `:${result.column}` : ''} · Check the input error`
        }

  const replaceInput = (value: string, action: string): void => {
    if (value === input) return
    setUndo({ value: input, action })
    setInput(value)
  }
  const formatInput = (): void => {
    if (result.ok && result.text) replaceInput(result.text, 'format')
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SplitPane labels={[uiText('Input'), uiText('Output')]}>
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-mac-lg border border-mac-separator bg-mac-surface">
          <ToolToolbar label={uiText('JSON input actions')} className="max-h-[45%] overflow-y-auto !px-2 !py-2">
            <button type="button" className="mac-btn-primary" disabled={!input.trim() || !result.ok} title={runShortcut.binding ? uiText('Format JSON ({value1})', { value1: formatShortcut(runShortcut.binding, runShortcut.platform) }) : uiText('Format JSON')} onClick={formatInput}>{uiText('Format')}</button>
            <button type="button" className="mac-btn-secondary" disabled={!input.trim() || !result.ok} onClick={() => {
              const minified = formatJson(input, { minify: true })
              if (minified.ok && minified.text) replaceInput(minified.text, 'minify')
            }}>{uiText('Minify')}</button>
            {undo && <button type="button" className="mac-btn-secondary" title={uiText('Restore the input before {action}', { action: undo.action })} onClick={() => { setInput(undo.value); setUndo(null) }}><Undo2 className="h-3.5 w-3.5" aria-hidden />{uiText('Undo')}</button>}
            <ToolOptions label={uiText('Formatting')}>
              <label className="flex items-center gap-2 text-[13px] text-mac-label-secondary">{uiText('Indent')}<select aria-label={uiText('Indent')} className="mac-input !w-auto" value={indent} onChange={(event) => setIndent(Number(event.target.value))}><option value={2}>{uiText('2 spaces')}</option><option value={4}>{uiText('4 spaces')}</option></select>
              </label>
              <label className="flex min-h-[34px] items-center gap-2 text-[13px] text-mac-label-secondary"><input type="checkbox" checked={sortKeys} onChange={(event) => setSortKeys(event.target.checked)} className="h-4 w-4 accent-mac-accent" />{uiText('Sort keys')}</label>
            </ToolOptions>
            <ToolOptions label={uiText('Input actions')}>
              <TextInputActions value={input} onChange={(value) => replaceInput(value, value ? 'opening a file' : 'clear')} output={outputText} fileName="formatted.json" accept=".json,.txt,application/json" actions={['open', 'clear']} />
              <button type="button" className="mac-btn-ghost" onClick={() => replaceInput(SAMPLE, 'sample')}>{uiText('Sample')}</button>
            </ToolOptions>
          </ToolToolbar>
          <div className="min-h-0 flex-1">
            <CodeEditor value={input} onChange={(value) => { if (value !== input) { setUndo(null); setInput(value) } }} language="json" placeholder={uiText('Paste JSON…')} label={uiText('JSON input')} issue={!input.trim() || result.ok ? null : result} onRun={formatInput} className="!rounded-none !border-0" />
          </div>
        </div>
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-mac-lg border border-mac-separator bg-mac-surface">
          <ToolToolbar label={uiText('JSON output actions')} className="max-h-[45%] overflow-y-auto !px-2 !py-2">
            <SegmentedControl label={uiText('JSON output view')} value={view} onChange={setView} options={[{ value: 'tree', label: messageKey('Tree') }, { value: 'raw', label: messageKey('Raw') }]} />
            <CopyButton text={outputText} label={uiText('Copy output')} />
            <ToolOptions label={uiText('Export')}>
              <SaveToBoxButton type="json" content={result.ok ? outputText || input : input} disabled={!input.trim() || !result.ok} />
              <TextInputActions value={input} onChange={setInput} output={outputText} fileName="formatted.json" accept=".json,.txt,application/json" actions={['download']} />
            </ToolOptions>
          </ToolToolbar>
          <div className="min-h-0 flex-1">
            {view === 'tree' ? result.ok ? <TreeView data={treeData} className="!rounded-none !border-0" /> : (
              <div className="flex h-full items-center justify-center p-6 text-center text-[13px] text-mac-label-secondary">
                {input.trim() ? uiText('Fix the highlighted error in Input to see the tree.') : uiText('Paste JSON or open a file in Input to explore its structure.')}
              </div>
            ) : <CodeEditor value={outputText} language="json" readOnly label={uiText('Formatted output')} className="!rounded-none !border-0" />}
          </div>
        </div>
      </SplitPane>

      <footer className="flex shrink-0 items-center border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={status.tone}>{status.text}</ToolStatus>
      </footer>
    </div>
  )
}
