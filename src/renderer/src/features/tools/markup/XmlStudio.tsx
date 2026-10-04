import { useMemo, useState } from 'react'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import { formatXml, minifyXml } from '@shared/xml'
import { validateXmlDocument } from '@shared/xml/browser'
import { TextInputActions } from '@renderer/components/ui/TextInputActions'
import { SplitPane } from '@renderer/components/ui/SplitPane'
import { useToolDraft } from '@renderer/hooks/useToolDraft'
import { SaveToBoxButton } from '@renderer/features/secret-box/SaveToBoxButton'

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<root>
  <item id="1">Alpha</item>
  <item id="2">Beta</item>
  <meta local="true"/>
</root>
`

export default function XmlStudio(): JSX.Element {
  const [input, setInput] = useState(SAMPLE)
  const [indent, setIndent] = useState(2)
  useToolDraft('markup.xml', input, setInput, {
    label: 'XML Studio',
    historyOnUnmount: true
  })

  const validated = useMemo(() => validateXmlDocument(input), [input])
  const formatted = useMemo(() => formatXml(input, { indent }), [input, indent])
  const output = validated.ok && formatted.ok ? formatted.text : ''
  const runFormat = (): void => { if (validated.ok && formatted.ok) setInput(formatted.text) }

  const status = !input.trim()
    ? { tone: 'neutral' as const, text: 'Paste XML to get started' }
    : validated.ok
      ? {
          tone: 'success' as const,
          text: `Well-formed · ${input.length.toLocaleString()} chars`
        }
      : {
          tone: 'danger' as const,
          text: `Invalid${validated.line ? ` · line ${validated.line}` : ''} — ${validated.error}`
        }

  return (
    <div className="flex h-full flex-col">
      <ToolToolbar>
        <button
          type="button"
          className="mac-btn-primary"
          disabled={!input.trim() || !validated.ok || !formatted.ok}
          onClick={runFormat}
        >
          Format
        </button>
        <button
          type="button"
          className="mac-btn-secondary"
          disabled={!input.trim() || !validated.ok}
          onClick={() => {
            const r = minifyXml(input)
            if (r.ok) setInput(r.text)
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
        <div className="ml-auto flex gap-2">
          <SaveToBoxButton
            type="text"
            content={output}
            defaultName={`xml-${new Date().toISOString().slice(0, 10)}.xml`}
            disabled={!input.trim() || !validated.ok}
          />
          <CopyButton text={output} label="Copy output" />
          <button type="button" className="mac-btn-ghost" onClick={() => setInput(SAMPLE)}>
            Sample
          </button>
        </div>
        <TextInputActions value={input} onChange={setInput} output={output} fileName="formatted.xml" accept=".xml,.xhtml,.svg,text/xml,application/xml" />
      </ToolToolbar>

      <SplitPane>
        <CodeEditor
          value={input}
          onChange={setInput}
          language="xml"
          label="XML input"
          issue={input.trim() && !validated.ok ? validated : null}
          onRun={runFormat}
          placeholder="Paste XML…"
        />
        <CodeEditor value={output} language="xml" label="Formatted XML" readOnly placeholder="Fix errors to see formatted output" />
      </SplitPane>

      <footer className="shrink-0 border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={status.tone}>{status.text}</ToolStatus>
      </footer>
    </div>
  )
}
