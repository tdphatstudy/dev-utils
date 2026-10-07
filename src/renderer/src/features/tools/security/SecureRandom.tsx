import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useMemo, useState } from 'react'
import {
  estimatePasswordEntropy,
  generatePassword,
  generateUuidV4,
  passwordAlphabetSize,
  randomBase64,
  randomHex
} from '@shared/crypto/random'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import { RefreshCw } from 'lucide-react'

type Tab = 'password' | 'bytes' | 'uuid'

export default function SecureRandom(): JSX.Element {
  useUiLocale()
  const [tab, setTab] = useState<Tab>('password')
  const [length, setLength] = useState(20)
  const [byteLen, setByteLen] = useState(32)
  const [lower, setLower] = useState(true)
  const [upper, setUpper] = useState(true)
  const [digits, setDigits] = useState(true)
  const [symbols, setSymbols] = useState(true)
  const [format, setFormat] = useState<'hex' | 'base64'>('hex')
  const [nonce, setNonce] = useState(0)

  const passwordResult = useMemo(() => {
    void nonce
    try {
      return { value: generatePassword({ length, lower, upper, digits, symbols }), error: null }
    } catch (error) {
      return { value: '', error: error instanceof Error ? error.message : 'Password generation failed' }
    }
  }, [length, lower, upper, digits, symbols, nonce])

  const alphabetSize = passwordAlphabetSize({ lower, upper, digits, symbols })
  const entropy = estimatePasswordEntropy(length, alphabetSize)

  const bytesOut = useMemo(() => {
    void nonce
    return format === 'hex' ? randomHex(byteLen) : randomBase64(byteLen)
  }, [byteLen, format, nonce])

  const uuid = useMemo(() => {
    void nonce
    return generateUuidV4()
  }, [nonce])

  const current =
    tab === 'password' ? passwordResult.value : tab === 'bytes' ? bytesOut : uuid

  return (
    <div className="flex h-full flex-col">
      <ToolToolbar>
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { value: 'password', label: 'Password' },
            { value: 'bytes', label: 'Random bytes' },
            { value: 'uuid', label: 'UUID v4' }
          ]}
        />
        <button type="button" className="mac-btn-primary" disabled={tab === 'password' && !!passwordResult.error} onClick={() => setNonce((n) => n + 1)}>
          <RefreshCw className="h-3.5 w-3.5" />
          {uiText('Generate')}</button>
        <div className="ml-auto">
          <CopyButton text={current} />
        </div>
      </ToolToolbar>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-5">
        <div className="rounded-mac-lg border border-mac-separator bg-mac-surface p-4 shadow-mac">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
            Output · CSPRNG (Web Crypto)
          </div>
          <pre className="code-select whitespace-pre-wrap break-all font-mono text-[14px] leading-relaxed text-mac-label">
            {current || '—'}
          </pre>
        </div>

        {tab === 'password' && (
          <div className="grid max-w-xl gap-3 rounded-mac-lg border border-mac-separator bg-mac-surface p-4">
            <label className="flex items-center justify-between gap-4 text-[13px]">
              <span className="text-mac-label-secondary">Length</span>
              <input
                type="range"
                min={8}
                max={64}
                value={length}
                onChange={(e) => setLength(Number(e.target.value))}
                className="flex-1 accent-mac-accent"
              />
              <span className="w-8 text-right font-mono">{length}</span>
            </label>
            <div className="flex flex-wrap gap-3 text-[13px] text-mac-label-secondary">
              <Toggle label="a–z" checked={lower} onChange={setLower} />
              <Toggle label="A–Z" checked={upper} onChange={setUpper} />
              <Toggle label="0–9" checked={digits} onChange={setDigits} />
              <Toggle label="Symbols" checked={symbols} onChange={setSymbols} />
            </div>
            <p className="text-[12px] text-mac-label-secondary">
              Alphabet estimate (upper bound):{' '}
              <span className="font-medium text-mac-label">~{entropy.toFixed(0)} bits</span>
              {entropy < 50 && (
                <span className="text-mac-warning"> · weak for sensitive use</span>
              )}
              {entropy >= 80 && <span className="text-mac-success"> · strong</span>}
            </p>
            {passwordResult.error && <p role="alert" className="text-[12px] text-mac-danger">{passwordResult.error}. Enable a–z, A–Z, digits or symbols.</p>}
          </div>
        )}

        {tab === 'bytes' && (
          <div className="grid max-w-xl gap-3 rounded-mac-lg border border-mac-separator bg-mac-surface p-4">
            <label className="flex items-center justify-between gap-4 text-[13px]">
              <span className="text-mac-label-secondary">Bytes</span>
              <input
                type="range"
                min={8}
                max={128}
                value={byteLen}
                onChange={(e) => setByteLen(Number(e.target.value))}
                className="flex-1 accent-mac-accent"
              />
              <span className="w-8 text-right font-mono">{byteLen}</span>
            </label>
            <SegmentedControl
              value={format}
              onChange={setFormat}
              options={[
                { value: 'hex', label: 'Hex' },
                { value: 'base64', label: 'Base64' }
              ]}
            />
          </div>
        )}

        {tab === 'uuid' && (
          <p className="max-w-xl text-[12px] text-mac-label-secondary">
            RFC 4122 UUID version 4, filled with cryptographically secure random bits.
          </p>
        )}
      </div>
    </div>
  )
}

function Toggle({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}): JSX.Element {
  useUiLocale()
  return (
    <label className="flex items-center gap-1.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-mac-accent"
      />
      {label}
    </label>
  )
}
