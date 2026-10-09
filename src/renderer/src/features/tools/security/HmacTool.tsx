import { messageKey } from '@shared/i18n/message-key'
import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useCallback, useState } from 'react'
import { useAsyncValue } from '@renderer/hooks/useAsyncValue'
import { hmacBase64, hmacHex, type HmacAlgorithm } from '@shared/crypto/hmac'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { SplitPane } from '@renderer/components/ui/SplitPane'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'

export default function HmacTool(): JSX.Element {
  useUiLocale()
  const [message, setMessage] = useState('hello')
  const [secret, setSecret] = useState('')
  const [secretTouched, setSecretTouched] = useState(false)
  const [algo, setAlgo] = useState<HmacAlgorithm>('SHA-256')
  const [format, setFormat] = useState<'hex' | 'base64'>('hex')
  const [showSecret, setShowSecret] = useState(false)
  const [activePane, setActivePane] = useState<0 | 1>(0)
  const compute = useCallback(async () => {
    if (!secret) throw new Error('Enter a secret key to calculate the HMAC.')
    return format === 'hex' ? hmacHex(message, secret, algo) : hmacBase64(message, secret, algo)
  }, [message, secret, algo, format])
  const { value, error, pending } = useAsyncValue(compute)
  const out = value ?? ''
  const keyError = secretTouched && !secret ? 'Enter a secret key. The key is UTF-8 text, not Hex or Base64.' : null
  const calculating = Boolean(secret && pending)

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-y-auto">
      <ToolToolbar label={uiText('HMAC options')}>
        <label className="flex items-center gap-2 text-[13px] text-mac-label-secondary">{uiText('Algorithm')}<select className="mac-input !w-auto" value={algo} onChange={(e) => setAlgo(e.target.value as HmacAlgorithm)}>
            <option value="SHA-256">SHA-256</option>
            <option value="SHA-512">SHA-512</option>
            <option value="SHA-1">SHA-1</option>
          </select>
        </label>
        <SegmentedControl value={format} onChange={setFormat} label={uiText('HMAC output encoding')} options={[
          { value: 'hex', label: messageKey('Hex') },
          { value: 'base64', label: 'Base64' }
        ]} />
        <div className="ml-auto"><CopyButton text={out} label={uiText('Copy HMAC')} /></div>
      </ToolToolbar>

      <div className="shrink-0 border-b border-mac-separator px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <label htmlFor="hmac-secret" className="shrink-0 text-[13px] font-semibold text-mac-label">{uiText('Secret key')} <span className="sr-only">{uiText('(UTF-8 text)')}</span></label>
          <input id="hmac-secret" className="mac-input min-w-0 flex-1 font-mono" type={showSecret ? 'text' : 'password'} value={secret} onChange={(e) => setSecret(e.target.value)} onBlur={() => setSecretTouched(true)}
            placeholder={uiText('Enter a secret key')} autoComplete="off" spellCheck={false} aria-required="true" aria-invalid={Boolean(keyError)} aria-describedby="hmac-key-help" />
          <button type="button" className="mac-btn-secondary shrink-0" aria-label={showSecret ? uiText('Hide secret key') : uiText('Show secret key')} aria-pressed={showSecret} onClick={() => setShowSecret(!showSecret)}>{showSecret ? uiText('Hide') : uiText('Show')}</button>
        </div>
        <p id="hmac-key-help" className={`mt-1 text-[12px] leading-relaxed ${keyError ? 'text-mac-danger' : 'text-mac-label-secondary'}`}>
          {keyError ?? uiText('Updates as you type · UTF-8 key and message. Secret keys are not saved.')}
        </p>
      </div>

      <div className="flex min-h-[200px] flex-1 flex-col [@media(max-height:300px)]:min-h-[175px]">
      <SplitPane labels={[uiText('Input'), uiText('Output')]} activePane={activePane} onPaneChange={setActivePane}>
        <CodeEditor value={message} onChange={setMessage} language="text" label={uiText('HMAC message (UTF-8)')} />
        <div className="h-full min-h-0 min-w-0" aria-busy={calculating}>
          <CodeEditor value={out} language="text" label={uiText('HMAC-{algo} ({value2})', { algo: algo, value2: format === 'hex' ? uiText('Hex') : 'Base64' })} placeholder={!secret ? uiText('Enter a secret key to calculate the HMAC.') : calculating ? uiText('Calculating…') : uiText('No result')} readOnly />
        </div>
      </SplitPane>
      </div>

      <footer className="shrink-0 border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={secret && error ? 'danger' : out ? 'success' : 'neutral'}>
          {!secret ? uiText('Enter a secret key to get started.') : error ?? (calculating ? uiText('Calculating current message and key…') : uiText('HMAC-{algo} · {format} · UTF-8 key and message · local only', { algo: algo, format: format === 'hex' ? uiText('Hex') : 'Base64' }))}
        </ToolStatus>
      </footer>
    </div>
  )
}
