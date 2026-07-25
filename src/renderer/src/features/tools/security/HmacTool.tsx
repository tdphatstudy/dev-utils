import { useEffect, useState } from 'react'
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
  const [out, setOut] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const v =
          format === 'hex'
            ? await hmacHex(message, secret, algo)
            : await hmacBase64(message, secret, algo)
        if (!cancelled) {
          setOut(v)
          setError(null)
        }
      } catch (e) {
        if (!cancelled) {
          setOut('')
          setError(e instanceof Error ? e.message : 'HMAC failed')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [message, secret, algo, format])

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

      <div className="grid min-h-0 flex-1 grid-rows-[auto_1fr_auto] gap-3 p-3">
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
            Secret key
          </label>
          <input
            className="mac-input font-mono"
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Secret (stays local)"
            autoComplete="off"
          />
        </div>
        <div className="grid min-h-0 grid-cols-2 gap-3">
          <div className="flex min-h-0 flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
              Message
            </span>
            <CodeEditor value={message} onChange={setMessage} language="text" />
          </div>
          <div className="flex min-h-0 flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
              MAC
            </span>
            <div className="selectable flex-1 overflow-auto rounded-mac-lg border border-mac-separator bg-mac-surface p-3 font-mono text-[13px] break-all">
              {out || '—'}
            </div>
          </div>
        </div>
      </div>

      <footer className="border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={error ? 'danger' : 'success'}>
          {error ?? `HMAC-${algo} · Web Crypto · local only`}
        </ToolStatus>
      </footer>
    </div>
  )
}
