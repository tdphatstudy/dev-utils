import { useMemo, useState } from 'react'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import { formatHtml, minifyHtml, validateHtml } from '@shared/html'
import { useToolDraft } from '@renderer/hooks/useToolDraft'
import { SaveToBoxButton } from '@renderer/features/secret-box/SaveToBoxButton'

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
  useToolDraft('markup.html', input, setInput, {
    label: 'HTML Studio',
    historyOnUnmount: true
  })

  const validated = useMemo(() => validateHtml(input), [input])
  const formatted = useMemo(
    () => formatHtml(input, { indent }),
    [input, indent]
  )

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
          onClick={() => {
            const r = formatHtml(input, { indent })
            if (r.ok) setInput(r.text)
          }}
        >
          Format
        </button>
        <button
          type="button"
          className="mac-btn-secondary"
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
        <div className="ml-auto flex gap-2">
          <SaveToBoxButton
            type="text"
            content={formatted.ok ? formatted.text : input}
            defaultName={`html-${new Date().toISOString().slice(0, 10)}.html`}
            disabled={!input.trim()}
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
          language="text"
          placeholder="Paste HTML…"
        />
      </div>

      <footer className="border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={status.tone}>{status.text}</ToolStatus>
      </footer>
    </div>
  )
}
