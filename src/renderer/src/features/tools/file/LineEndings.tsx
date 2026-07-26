import { useMemo, useState } from 'react'
import { convertLineEndings, countLines, detectLineEnding, type LineEnding } from '@shared/file/text'
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
        <button type="button" className="mac-btn-primary" onClick={() => setInput(output)}>
          Apply to input
        </button>
        <div className="ml-auto flex gap-2">
          <CopyButton text={output} />
          <button type="button" className="mac-btn-ghost" onClick={() => setInput(SAMPLE)}>
            Sample
          </button>
        </div>
      </ToolToolbar>

      <SplitPane>
        <CodeEditor value={input} onChange={setInput} language="text" placeholder="Paste text…" />
        <CodeEditor value={output} language="text" readOnly />
      </SplitPane>

      <footer className="border-t border-mac-separator px-4 py-2">
        <ToolStatus tone="success">
          Convert → {target.toUpperCase()} · output {output.length.toLocaleString()} chars
        </ToolStatus>
      </footer>
    </div>
  )
}
