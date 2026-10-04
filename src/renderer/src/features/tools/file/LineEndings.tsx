import { useMemo, useState } from 'react'
import { convertLineEndings, countLines, detectLineEnding, lineEndingCounts, type LineEnding } from '@shared/file/text'
import { TextInputActions } from '@renderer/components/ui/TextInputActions'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { SplitPane } from '@renderer/components/ui/SplitPane'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import { useToolDraft } from '@renderer/hooks/useToolDraft'

const SAMPLE = 'line one\r\nline two\r\nline three\n'

export default function LineEndings(): JSX.Element {
  const [input, setInput] = useState(SAMPLE)
  const [target, setTarget] = useState<LineEnding>('lf')
  useToolDraft('file.lineendings', input, setInput, {
    label: 'Line endings',
    historyOnUnmount: true
  })

  const detected = useMemo(() => detectLineEnding(input), [input])
  const output = useMemo(() => convertLineEndings(input, target), [input, target])
  const lines = useMemo(() => countLines(input), [input])
  const counts = useMemo(() => lineEndingCounts(input), [input])

  return (
    <div className="flex h-full flex-col">
      <ToolToolbar>
        <span className="text-[12px] text-mac-label-secondary">
          Detected: <strong className="text-mac-label">{detected}</strong> · {lines} lines
        </span>
        <SegmentedControl
          value={target}
          onChange={setTarget}
          options={[
            { value: 'lf', label: 'LF' },
            { value: 'crlf', label: 'CRLF' },
            { value: 'cr', label: 'CR' }
          ]}
        />
        <button type="button" className="mac-btn-primary" disabled={!input || input === output} onClick={() => setInput(output)}>
          Apply to input
        </button>
        <div className="ml-auto flex gap-2">
          <CopyButton text={output} />
          <button type="button" className="mac-btn-ghost" onClick={() => setInput(SAMPLE)}>
            Sample
          </button>
        </div>
        <TextInputActions value={input} onChange={setInput} output={output} fileName={`converted-${target}.txt`} accept="text/*,.txt,.csv,.log,.md" />
      </ToolToolbar>

      <SplitPane>
        <CodeEditor value={input} onChange={setInput} language="text" label="Original text" placeholder="Paste text…" />
        <CodeEditor value={output} language="text" label={`Converted text (${target.toUpperCase()})`} readOnly />
      </SplitPane>

      <footer className="shrink-0 border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={!input ? 'neutral' : detected === 'mixed' ? 'warning' : 'success'}>
          {!input ? 'Open a UTF-8 file or paste text to begin' : `Input: ${counts.crlf} CRLF · ${counts.lf} LF · ${counts.cr} CR · output ${new TextEncoder().encode(output).length.toLocaleString()} bytes (${target.toUpperCase()})`}
        </ToolStatus>
        <p className="mt-1 text-[11px] text-mac-label-tertiary">Editing normalizes editor line breaks to LF. Download preserves the selected output ending, including the final newline.</p>
      </footer>
    </div>
  )
}
