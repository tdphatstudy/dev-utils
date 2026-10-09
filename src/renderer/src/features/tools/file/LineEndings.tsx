import { messageKey } from '@shared/i18n/message-key'
import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
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
  useUiLocale()
  const [input, setInput] = useState(SAMPLE)
  const [target, setTarget] = useState<LineEnding>('lf')
  useToolDraft('file.lineendings', input, setInput, {
    label: messageKey('Line endings'),
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
          {uiText('Detected:')} <strong className="text-mac-label">{detected}</strong> · {lines} {uiText('lines')}</span>
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
          {uiText('Apply to input')}</button>
        <div className="ml-auto flex gap-2">
          <CopyButton text={output} />
          <button type="button" className="mac-btn-ghost" onClick={() => setInput(SAMPLE)}>
            {uiText('Sample')}</button>
        </div>
        <TextInputActions value={input} onChange={setInput} output={output} fileName={`converted-${target}.txt`} accept="text/*,.txt,.csv,.log,.md" preserveBom />
      </ToolToolbar>

      <SplitPane>
        <CodeEditor value={input} onChange={setInput} language="text" label={uiText('Original text')} placeholder={uiText('Paste text…')} />
        <CodeEditor value={output} language="text" label={uiText('Converted text ({value1})', { value1: target.toUpperCase() })} readOnly />
      </SplitPane>

      <footer className="shrink-0 border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={!input ? 'neutral' : detected === 'mixed' ? 'warning' : 'success'}>
          {!input ? uiText('Open a UTF-8 file or paste text to begin') : uiText('Input: {crlf} CRLF · {lf} LF · {cr} CR · output {value4} bytes ({value5})', { crlf: counts.crlf, lf: counts.lf, cr: counts.cr, value4: new TextEncoder().encode(output).length.toLocaleString(), value5: target.toUpperCase() })}
        </ToolStatus>
        <p className="mt-1 text-[11px] text-mac-label-tertiary">{uiText('Editing normalizes editor line breaks to LF. UTF-8 file import/download preserves the BOM and final newline; only line endings are converted.')}</p>
      </footer>
    </div>
  )
}
