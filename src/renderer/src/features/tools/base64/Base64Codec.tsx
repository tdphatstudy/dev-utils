import { messageKey } from '@shared/i18n/message-key'
import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useMemo, useState } from 'react'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { SplitPane } from '@renderer/components/ui/SplitPane'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import { decodeBase64, decodeBase64Bytes, encodeBase64, type Base64Variant } from '@shared/base64'
import { TextInputActions } from '@renderer/components/ui/TextInputActions'
import { useToolDraft } from '@renderer/hooks/useToolDraft'
import { SaveToBoxButton } from '@renderer/features/secret-box/SaveToBoxButton'
import { ArrowDownUp } from 'lucide-react'

type Mode = 'encode' | 'decode'

export default function Base64Codec(): JSX.Element {
  const { locale } = useUiLocale()
  const [mode, setMode] = useState<Mode>('encode')
  const [variant, setVariant] = useState<Base64Variant>('standard')
  const [decodedFormat, setDecodedFormat] = useState<'text' | 'hex'>('text')
  const [input, setInput] = useState('Hello, DevFusion!')
  useToolDraft('base64.codec', input, setInput, { label: 'Base64', historyOnUnmount: true })
  useToolDraft('base64.codec.options', JSON.stringify({ mode, variant, decodedFormat }), (draft) => {
    try {
      const restored: unknown = JSON.parse(draft)
      if (!restored || typeof restored !== 'object') return
      const options = restored as Record<string, unknown>
      if (options.mode === 'encode' || options.mode === 'decode') setMode(options.mode)
      if (options.variant === 'standard' || options.variant === 'url') setVariant(options.variant)
      if (options.decodedFormat === 'text' || options.decodedFormat === 'hex') setDecodedFormat(options.decodedFormat)
    } catch { /* An invalid session option draft leaves the safe defaults in place. */ }
  })

  const result = useMemo(() => {
    if (mode === 'encode') {
      return { ok: true as const, text: encodeBase64(input, variant) }
    }
    if (decodedFormat === 'hex') {
      const decoded = decodeBase64Bytes(input, variant)
      return decoded.ok ? { ok: true as const, text: Array.from(decoded.bytes, (byte) => byte.toString(16).padStart(2, '0')).join(' ') } : decoded
    }
    return decodeBase64(input, variant)
  }, [input, mode, variant, decodedFormat])

  const output = result.ok ? result.text : ''

  return (
    <div className="flex h-full flex-col">
      <ToolToolbar>
        <SegmentedControl
          value={mode}
          onChange={setMode}
          options={[
            { value: 'encode', label: messageKey('Encode') },
            { value: 'decode', label: messageKey('Decode') }
          ]}
        />
        {mode === 'decode' && <label className="flex items-center gap-2 text-[12px]">{uiText('Output')}<select aria-label={uiText('Output')} className="mac-input !w-auto" value={decodedFormat} onChange={(e) => setDecodedFormat(e.target.value as 'text' | 'hex')}>
            <option value="text">{uiText('UTF-8 text')}</option><option value="hex">{uiText('Hex bytes')}</option>
          </select>
        </label>}
        <SegmentedControl
          value={variant}
          onChange={setVariant}
          options={[
            { value: 'standard', label: messageKey('Standard') },
            { value: 'url', label: messageKey('URL-safe') }
          ]}
        />
        <button
          type="button"
          className="mac-btn-secondary"
          disabled={!input || !result.ok || (mode === 'decode' && decodedFormat === 'hex')}
          title={mode === 'decode' && decodedFormat === 'hex' ? uiText('Hex bytes cannot be reversed as UTF-8 text') : uiText('Use output as input and reverse the operation')}
          onClick={() => {
            if (result.ok) {
              setInput(result.text)
              setMode((m) => (m === 'encode' ? 'decode' : 'encode'))
            }
          }}
        >
          <ArrowDownUp className="h-3.5 w-3.5" />
          {uiText('Reverse')}</button>
        <div className="ml-auto flex items-center gap-2">
          <SaveToBoxButton type="text" content={output} defaultName="base64-output.txt" disabled={!result.ok || !output} />
          <CopyButton text={output} />
        </div>
        <TextInputActions value={input} onChange={setInput} output={output} fileName={mode === 'encode' ? 'encoded-base64.txt' : decodedFormat === 'hex' ? 'decoded-hex.txt' : 'decoded.txt'} accept=".txt,.b64,.base64,text/*" />
      </ToolToolbar>

      <SplitPane>
        <CodeEditor
          value={input}
          onChange={setInput}
          language="text"
          label={mode === 'encode' ? uiText('Text input (UTF-8)') : uiText('Base64 input')}
          placeholder={mode === 'encode' ? uiText('Plain text…') : uiText('Base64…')}
        />
        <CodeEditor value={output} language="text" label={mode === 'encode' ? uiText('Encoded Base64') : decodedFormat === 'hex' ? uiText('Decoded bytes (hex)') : uiText('Decoded UTF-8 text')} readOnly />
      </SplitPane>

      <footer className="flex items-center border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={!input ? 'neutral' : result.ok ? 'success' : 'danger'}>
          {!input ? uiText('Enter text or Base64 to begin · Base64 is an encoding, not encryption') : result.ok
            ? uiText('{value1} · {value2} chars', { value1: uiText(mode === 'encode' ? 'Encoded' : 'Decoded'), value2: output.length.toLocaleString(locale) })
            : uiText(result.error)}
        </ToolStatus>
      </footer>
    </div>
  )
}
