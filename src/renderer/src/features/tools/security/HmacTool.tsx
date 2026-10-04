import { useCallback, useState } from 'react'
import { useAsyncValue } from '@renderer/hooks/useAsyncValue'
import { hmacBase64, hmacHex, type HmacAlgorithm } from '@shared/crypto/hmac'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'

export default function HmacTool(): JSX.Element {
  const [message, setMessage] = useState('hello')
  const [secret, setSecret] = useState('secret')
  const [algo, setAlgo] = useState<HmacAlgorithm>('SHA-256')
  const [format, setFormat] = useState<'hex' | 'base64'>('hex')
  const [showSecret, setShowSecret] = useState(false)
  const compute = useCallback(async () => {
    if (!secret) throw new Error('Enter a secret key to calculate the HMAC.')
    return format === 'hex' ? hmacHex(message, secret, algo) : hmacBase64(message, secret, algo)
  }, [message, secret, algo, format])
  const { value, error, pending } = useAsyncValue(compute)
  const out = value ?? ''

  return (
    <div className="flex h-full flex-col">
      <ToolToolbar>
        <label className="flex items-center gap-2 text-[12px] text-mac-label-secondary">
          HMAC
          <select
            className="mac-input !w-auto !py-1"
            value={algo}
            onChange={(e) => setAlgo(e.target.value as HmacAlgorithm)}
          >
            <option value="SHA-256">SHA-256</option>
            <option value="SHA-512">SHA-512</option>
            <option value="SHA-1">SHA-1</option>
          </select>
        </label>
        <SegmentedControl
          value={format}
          onChange={setFormat}
          options={[
            { value: 'hex', label: 'Hex' },
            { value: 'base64', label: 'Base64' }
          ]}
        />
        <div className="ml-auto">
          <CopyButton text={out} />
        </div>
      </ToolToolbar>

      <div className="grid min-h-0 flex-1 grid-rows-[auto_1fr] gap-3 overflow-auto p-3">
        <div>
          <label htmlFor="hmac-secret" className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
            Secret key
          </label>
          <input
            className="mac-input font-mono"
            id="hmac-secret"
            type={showSecret ? 'text' : 'password'}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Secret (stays local)"
            autoComplete="off"
          />
          <label className="mt-2 flex items-center gap-2 text-[12px] text-mac-label-secondary">
            <input type="checkbox" checked={showSecret} onChange={(e) => setShowSecret(e.target.checked)} /> Show secret
          </label>
        </div>
        <div className="grid min-h-[332px] grid-cols-1 grid-rows-2 gap-3 md:min-h-0 md:grid-cols-2 md:grid-rows-1">
          <div className="flex min-h-0 flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
              Message
            </span>
            <CodeEditor value={message} onChange={setMessage} language="text" label="HMAC message (UTF-8)" />
          </div>
          <div className="flex min-h-0 flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
              MAC
            </span>
            <div className="selectable flex-1 overflow-auto rounded-mac-lg border border-mac-separator bg-mac-surface p-3 font-mono text-[13px] break-all">
              {pending ? 'Calculating…' : out || '—'}
            </div>
          </div>
        </div>
      </div>

      <footer className="shrink-0 border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={error ? 'danger' : pending ? 'neutral' : 'success'}>
          {error ?? (pending ? 'Calculating current message and key…' : `HMAC-${algo} · ${format} · UTF-8 key and message · local only`)}
        </ToolStatus>
      </footer>
    </div>
  )
}
