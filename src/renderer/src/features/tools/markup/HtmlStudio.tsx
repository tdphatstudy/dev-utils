import { useMemo, useState } from 'react'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import { formatHtml, minifyHtml, validateHtml } from '@shared/html'
import { useToolDraft } from '@renderer/hooks/useToolDraft'
import { SaveToBoxButton } from '@renderer/features/secret-box/SaveToBoxButton'
import { TextInputActions } from '@renderer/components/ui/TextInputActions'
import { SplitPane } from '@renderer/components/ui/SplitPane'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'

const SAMPLE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>DevUtils</title>
</head>
<body>
  <h1>Hello</h1>
  <p>Local <strong>HTML</strong> tools.</p>
</body>
</html>
`

export default function HtmlStudio(): JSX.Element {
  const [input, setInput] = useState(SAMPLE)
  const [indent, setIndent] = useState(2)
  const [view, setView] = useState<'formatted' | 'preview'>('formatted')
  useToolDraft('markup.html', input, setInput, {
    label: 'HTML Studio',
    historyOnUnmount: true
  })

  const validated = useMemo(() => validateHtml(input), [input])
  const formatted = useMemo(
    () => formatHtml(input, { indent }),
    [input, indent]
  )
  const output = formatted.ok ? formatted.text : ''
  const runFormat = (): void => { if (formatted.ok) setInput(formatted.text) }
  const previewDocument = `<!DOCTYPE html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; base-uri 'none'; form-action 'none';"></head><body>${input}</body></html>`

  const status = !input.trim()
    ? { tone: 'neutral' as const, text: 'Paste HTML to get started' }
    : validated.ok
      ? {
          tone: 'success' as const,
          text: `OK · ${input.length.toLocaleString()} chars · structural check`
        }
      : {
          tone: 'danger' as const,
          text: `Issue${validated.line ? ` · line ${validated.line}` : ''} — ${validated.error}`
        }

  return (
    <div className="flex h-full flex-col">
      <ToolToolbar>
        <button
          type="button"
          className="mac-btn-primary"
          disabled={!input.trim() || !formatted.ok}
          onClick={runFormat}
        >
          Format
        </button>
        <button
          type="button"
          className="mac-btn-secondary"
          disabled={!input.trim() || !validated.ok}
          onClick={() => {
            const r = minifyHtml(input)
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
        <SegmentedControl value={view} onChange={setView} options={[{ value: 'formatted', label: 'Formatted' }, { value: 'preview', label: 'Static preview' }]} />
        <div className="ml-auto flex gap-2">
          <SaveToBoxButton
            type="text"
            content={output}
            defaultName={`html-${new Date().toISOString().slice(0, 10)}.html`}
            disabled={!input.trim() || !formatted.ok}
          />
          <CopyButton text={output} label="Copy output" />
          <button type="button" className="mac-btn-ghost" onClick={() => setInput(SAMPLE)}>
            Sample
          </button>
        </div>
        <TextInputActions value={input} onChange={setInput} output={output} fileName="formatted.html" accept=".html,.htm,text/html" />
      </ToolToolbar>

      <SplitPane>
        <CodeEditor
          value={input}
          onChange={setInput}
          language="html"
          label="HTML input"
          issue={input.trim() && !validated.ok ? validated : null}
          onRun={runFormat}
          placeholder="Paste HTML…"
        />
        {view === 'formatted' ? <CodeEditor value={output} language="html" label="Formatted HTML" readOnly placeholder="Fix structural issues to see formatted output" /> : <div className="flex min-h-0 flex-col overflow-hidden rounded-mac-lg border border-mac-separator">
          <p className="shrink-0 border-b border-mac-separator px-3 py-2 text-[11px] text-mac-label-secondary">Static preview · scripts and remote resources disabled</p>
          <iframe title="Static HTML preview" sandbox="" srcDoc={previewDocument} className="min-h-0 flex-1 bg-white" />
        </div>}
      </SplitPane>

      <footer className="shrink-0 border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={status.tone}>{status.text}</ToolStatus>
      </footer>
    </div>
  )
}
