import { useMemo, useState } from 'react'
import {
  decodeUriComponentSafe,
  encodeUriComponentSafe,
  parseUrl
} from '@shared/url'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { SplitPane } from '@renderer/components/ui/SplitPane'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import { useToolDraft } from '@renderer/hooks/useToolDraft'

type Mode = 'parse' | 'encode' | 'decode'

export default function UrlTools(): JSX.Element {
  const [mode, setMode] = useState<Mode>('parse')
  const [input, setInput] = useState(
    'https://user:pass@example.com:443/path?q=hello%20world&x=1#section'
  )
  useToolDraft('network.url', input, setInput, { label: 'URL Tools', historyOnUnmount: true })

  const parsed = useMemo(() => parseUrl(input), [input])
  const encoded = useMemo(() => encodeUriComponentSafe(input), [input])
  const decoded = useMemo(() => decodeUriComponentSafe(input), [input])

  const output =
    mode === 'parse'
      ? parsed.ok
        ? JSON.stringify(parsed.value, null, 2)
        : ''
      : mode === 'encode'
        ? encoded
        : decoded.ok
          ? decoded.text
          : ''

  const status =
    mode === 'parse'
      ? parsed.ok
        ? { tone: 'success' as const, text: 'Valid URL' }
        : { tone: 'danger' as const, text: parsed.error }
      : mode === 'decode' && !decoded.ok
        ? { tone: 'danger' as const, text: decoded.error }
        : { tone: 'success' as const, text: 'OK' }

  return (
    <div className="flex h-full flex-col">
      <ToolToolbar>
        <SegmentedControl
          value={mode}
          onChange={setMode}
          options={[
            { value: 'parse', label: 'Parse' },
            { value: 'encode', label: 'Encode' },
            { value: 'decode', label: 'Decode' }
          ]}
        />
        <div className="ml-auto">
          <CopyButton text={output} />
        </div>
      </ToolToolbar>

      <SplitPane>
        <CodeEditor value={input} onChange={setInput} language="text" placeholder="URL or component…" />
        <CodeEditor value={output} language={mode === 'parse' ? 'json' : 'text'} readOnly />
      </SplitPane>

      <footer className="flex items-center border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={status.tone}>{status.text}</ToolStatus>
      </footer>
    </div>
  )
}
