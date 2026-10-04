import { useMemo, useState } from 'react'
import {
  decodeUri,
  encodeUri,
  parseUrl,
  type UriEncoding
} from '@shared/url'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { SplitPane } from '@renderer/components/ui/SplitPane'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'

type Mode = 'parse' | 'encode' | 'decode'

export default function UrlTools(): JSX.Element {
  const [mode, setMode] = useState<Mode>('parse')
  const [encoding, setEncoding] = useState<UriEncoding>('component')
  const [input, setInput] = useState(
    'https://user:pass@example.com:443/path?q=hello%20world&x=1#section'
  )

  const parsed = useMemo(() => parseUrl(input), [input])
  const encoded = useMemo(() => encodeUri(input, encoding), [input, encoding])
  const decoded = useMemo(() => decodeUri(input, encoding), [input, encoding])

  const output =
    mode === 'parse'
      ? parsed.ok
        ? JSON.stringify(parsed.value, null, 2)
        : ''
      : mode === 'encode'
        ? encoded.ok ? encoded.text : ''
        : decoded.ok
          ? decoded.text
          : ''

  const status =
    !input ? { tone: 'neutral' as const, text: 'Enter a URL or text to begin' } : mode === 'parse'
      ? parsed.ok
        ? { tone: 'success' as const, text: 'Valid URL' }
        : { tone: 'danger' as const, text: parsed.error }
      : mode === 'decode' && !decoded.ok
        ? { tone: 'danger' as const, text: decoded.error }
        : mode === 'encode' && !encoded.ok
          ? { tone: 'danger' as const, text: encoded.error }
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
        {mode !== 'parse' && <label className="flex items-center gap-2 text-[12px]">
          Encoding
          <select className="mac-input !w-auto" value={encoding} onChange={(e) => setEncoding(e.target.value as UriEncoding)}>
            <option value="component">URI component</option>
            <option value="url">Whole URL</option>
            <option value="form">Form / query value (+ spaces)</option>
          </select>
        </label>}
        {mode !== 'parse' && <button type="button" className="mac-btn-secondary" disabled={status.tone === 'danger' || !input} onClick={() => {
          setInput(output); setMode(mode === 'encode' ? 'decode' : 'encode')
        }}>Reverse using output</button>}
        <div className="ml-auto">
          <CopyButton text={output} />
        </div>
      </ToolToolbar>

      <SplitPane>
        <CodeEditor value={input} onChange={setInput} language="text" label="URL or text input" placeholder="URL or component…" />
        <CodeEditor value={output} language={mode === 'parse' ? 'json' : 'text'} label={mode === 'parse' ? 'URL parts and query values' : 'Converted output'} readOnly />
      </SplitPane>

      <footer className="flex items-center border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={status.tone}>{status.text}</ToolStatus>
      </footer>
    </div>
  )
}
