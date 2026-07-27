import { useMemo, useState } from 'react'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import { formatXml, minifyXml, validateXml } from '@shared/xml'
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

  const validated = useMemo(() => validateXml(input), [input])
  const formatted = useMemo(() => formatXml(input, { indent }), [input, indent])

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
          onClick={() => {
            const r = formatXml(input, { indent })
            if (r.ok) setInput(r.text)
          }}
        >
          Format
        </button>
        <button
          type="button"
          className="mac-btn-secondary"
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
            content={formatted.ok ? formatted.text : input}
            defaultName={`xml-${new Date().toISOString().slice(0, 10)}.xml`}
            disabled={!validated.ok && !!input.trim()}
          />
          <CopyButton text={input} />
          <button type="button" className="mac-btn-ghost" onClick={() => setInput(SAMPLE)}>
            Sample
          </button>
        </div>
      </ToolToolbar>

      <div className="min-h-0 flex-1 p-3">
        <CodeEditor
          value={input}
          onChange={setInput}
          language="xml"
          placeholder="Paste XML…"
        />
      </div>

      <footer className="border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={status.tone}>{status.text}</ToolStatus>
      </footer>
    </div>
  )
}
