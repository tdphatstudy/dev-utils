import { useMemo, useState } from 'react'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import { decodeBase64, encodeBase64, type Base64Variant } from '@shared/base64'
import { useToolDraft } from '@renderer/hooks/useToolDraft'
import { ArrowDownUp } from 'lucide-react'

type Mode = 'encode' | 'decode'

export default function Base64Codec(): JSX.Element {
  const [mode, setMode] = useState<Mode>('encode')
  const [variant, setVariant] = useState<Base64Variant>('standard')
  const [input, setInput] = useState('Hello, DevUtils!')
  useToolDraft('base64.codec', input, setInput, { label: 'Base64', historyOnUnmount: true })

  const result = useMemo(() => {
    if (mode === 'encode') {
      return { ok: true as const, text: encodeBase64(input, variant) }
    }
    return decodeBase64(input, variant)
  }, [input, mode, variant])

  const output = result.ok ? result.text : ''

  return (
    <div className="flex h-full flex-col">
      <ToolToolbar>
        <SegmentedControl
          value={mode}
          onChange={setMode}
          options={[
            { value: 'encode', label: 'Encode' },
            { value: 'decode', label: 'Decode' }
          ]}
        />
        <SegmentedControl
          value={variant}
          onChange={setVariant}
          options={[
            { value: 'standard', label: 'Standard' },
            { value: 'url', label: 'URL-safe' }
          ]}
        />
        <button
          type="button"
          className="mac-btn-secondary"
          title="Swap input/output"
          onClick={() => {
            if (result.ok) {
              setInput(result.text)
              setMode((m) => (m === 'encode' ? 'decode' : 'encode'))
            }
          }}
        >
          <ArrowDownUp className="h-3.5 w-3.5" />
          Swap
        </button>
        <div className="ml-auto">
          <CopyButton text={output} />
        </div>
      </ToolToolbar>

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 p-3">
        <CodeEditor
          value={input}
          onChange={setInput}
          language="text"
          placeholder={mode === 'encode' ? 'Plain text…' : 'Base64…'}
        />
        <CodeEditor value={output} language="text" readOnly />
      </div>

      <footer className="flex items-center border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={result.ok ? 'success' : 'danger'}>
          {result.ok
            ? `${mode === 'encode' ? 'Encoded' : 'Decoded'} · ${output.length.toLocaleString()} chars`
            : result.error}
        </ToolStatus>
      </footer>
    </div>
  )
}
