import { useMemo, useState } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { SplitPane } from '@renderer/components/ui/SplitPane'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import {
  convertFormat,
  formatAdapters,
  getFormat,
  type FormatId
} from '@shared/convert/formats'
import { useToolDraft } from '@renderer/hooks/useToolDraft'
import { SaveToBoxButton } from '@renderer/features/secret-box/SaveToBoxButton'
import { TextInputActions } from '@renderer/components/ui/TextInputActions'

const SAMPLE_JSON = `{
  "name": "DevFusion",
  "version": 1,
  "features": ["json", "yaml"]
}`

export default function ConvertFileExt(): JSX.Element {
  const [from, setFrom] = useState<FormatId>('json')
  const [to, setTo] = useState<FormatId>('yaml')
  const [input, setInput] = useState(SAMPLE_JSON)
  const [indent, setIndent] = useState(2)

  useToolDraft('convert.file-ext', input, setInput, {
    label: 'Convert File Ext',
    historyOnUnmount: true
  })

  const result = useMemo(
    () => convertFormat(input, from, to, { indent }),
    [input, from, to, indent]
  )

  const output = result.ok ? result.text : ''
  const fromMeta = getFormat(from)
  const toMeta = getFormat(to)

  const swap = (): void => {
    setFrom(to)
    setTo(from)
    if (result.ok) setInput(result.text)
  }

  return (
    <div className="flex h-full flex-col">
      <ToolToolbar>
        <label className="flex items-center gap-1.5 text-[12px] text-mac-label-secondary">
          From
          <select
            className="mac-input !w-auto !py-1"
            value={from}
            onChange={(e) => setFrom(e.target.value as FormatId)}
          >
            {formatAdapters.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label} ({f.extensions.join(', ')})
              </option>
            ))}
          </select>
        </label>

        <button type="button" className="mac-btn-secondary" disabled={!result.ok} onClick={swap} title="Use the converted output as input and reverse formats">
          <ArrowLeftRight className="h-3.5 w-3.5" />
          Swap
        </button>

        <label className="flex items-center gap-1.5 text-[12px] text-mac-label-secondary">
          To
          <select
            className="mac-input !w-auto !py-1"
            value={to}
            onChange={(e) => setTo(e.target.value as FormatId)}
          >
            {formatAdapters.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label} ({f.extensions.join(', ')})
              </option>
            ))}
          </select>
        </label>

        {to === 'json' && (
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
        )}

        <div className="ml-auto flex gap-2">
          <SaveToBoxButton
            type={to === 'json' ? 'json' : 'text'}
            content={output}
            defaultName={to === 'json' ? undefined : `converted.${to === 'yaml' ? 'yaml' : 'txt'}`}
            disabled={!result.ok}
          />
          <CopyButton text={output} label="Copy output" />
          <button
            type="button"
            className="mac-btn-ghost"
            onClick={() => {
              setFrom('json')
              setTo('yaml')
              setInput(SAMPLE_JSON)
            }}
          >
            Sample
          </button>
        </div>
        <TextInputActions value={input} onChange={setInput} output={output} fileName={`converted.${to}`} accept=".json,.yaml,.yml,.txt" />
      </ToolToolbar>

      <SplitPane>
        <div className="flex min-h-0 flex-col gap-1">
          <span className="px-1 text-[11px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
            Input · {fromMeta.label}
          </span>
          <CodeEditor
            value={input}
            onChange={setInput}
            language={fromMeta.language}
            placeholder={`Paste ${fromMeta.label}…`}
            label={`${fromMeta.label} input`}
          />
        </div>
        <div className="flex min-h-0 flex-col gap-1">
          <span className="px-1 text-[11px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
            Output · {toMeta.label}
          </span>
          <CodeEditor value={output} language={toMeta.language} readOnly />
        </div>
      </SplitPane>

      <footer className="flex items-center border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={!input.trim() ? 'neutral' : result.ok ? 'success' : 'danger'}>
          {result.ok
            ? `${fromMeta.label} → ${toMeta.label} · ${output.length.toLocaleString()} chars`
            : result.error}
        </ToolStatus>
        <span className="ml-auto text-[11px] text-mac-label-tertiary">
          Extensible format hub · more formats later
        </span>
      </footer>
    </div>
  )
}
