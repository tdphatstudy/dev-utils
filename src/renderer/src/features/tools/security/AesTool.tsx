import { useEffect, useRef, useState } from 'react'
import { aesGcmDecrypt, aesGcmEncrypt } from '@shared/crypto/aes'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'

type Mode = 'encrypt' | 'decrypt'

export default function AesTool(): JSX.Element {
  const [mode, setMode] = useState<Mode>('encrypt')
  const [password, setPassword] = useState('')
  const [input, setInput] = useState('Secret message for DevFusion')
  const [output, setOutput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [hasResult, setHasResult] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const operation = useRef(0)
  useEffect(() => () => { operation.current++ }, [])

  const invalidate = (): void => {
    operation.current++
    setBusy(false)
    setOutput('')
    setHasResult(false)
    setError(null)
  }
  const changeInput = (value: string): void => { invalidate(); setInput(value) }

  const run = async (): Promise<void> => {
    if (busy || !password || (mode === 'decrypt' && !input.trim())) return
    const request = ++operation.current
    setBusy(true)
    setError(null)
    setOutput('')
    setHasResult(false)
    try {
      if (mode === 'encrypt') {
        const r = await aesGcmEncrypt(input, password)
        if (request !== operation.current) return
        if (!r.ok) setError(r.error)
        else { setOutput(r.ciphertext); setHasResult(true) }
      } else {
        const r = await aesGcmDecrypt(input, password)
        if (request !== operation.current) return
        if (!r.ok) setError(r.error)
        else { setOutput(r.plaintext); setHasResult(true) }
      }
    } catch (e) {
      if (request === operation.current) setError(e instanceof Error ? e.message : 'Operation failed')
    } finally {
      if (request === operation.current) setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ToolToolbar>
        <SegmentedControl
          value={mode}
          onChange={(value) => { invalidate(); setMode(value) }}
          options={[
            { value: 'encrypt', label: 'Encrypt' },
            { value: 'decrypt', label: 'Decrypt' }
          ]}
        />
        <button type="button" className="mac-btn-primary" disabled={busy || !password || (mode === 'decrypt' && !input.trim())} onClick={run}>
          {busy ? 'Working…' : mode === 'encrypt' ? 'Encrypt' : 'Decrypt'}
        </button>
        <button type="button" className="mac-btn-secondary" disabled={!hasResult || busy} onClick={() => {
          const next = output
          invalidate()
          setInput(next)
          setMode(mode === 'encrypt' ? 'decrypt' : 'encrypt')
        }}>Use output to {mode === 'encrypt' ? 'decrypt' : 'encrypt'}</button>
        <div className="ml-auto">
          <CopyButton text={output} />
        </div>
      </ToolToolbar>

      <div className="grid min-h-0 flex-1 grid-rows-[auto_1fr] gap-3 overflow-auto p-3">
        <div>
          <label htmlFor="aes-password" className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
            Password (PBKDF2 → AES-256-GCM)
          </label>
          <input
            className="mac-input font-mono"
            id="aes-password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => { invalidate(); setPassword(e.target.value) }}
            placeholder="Passphrase — never leaves this machine"
            autoComplete="off"
          />
          <label className="mt-2 flex items-center gap-2 text-[12px] text-mac-label-secondary">
            <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} /> Show password
          </label>
          <p className="mt-1 text-[11px] text-mac-label-tertiary">
            Output packs salt + IV + ciphertext as Base64. Use the same password to decrypt.
          </p>
        </div>
        <div className="grid min-h-[332px] grid-cols-1 grid-rows-2 gap-3 md:min-h-0 md:grid-cols-2 md:grid-rows-1">
          <CodeEditor
            value={input}
            onChange={changeInput}
            label={mode === 'encrypt' ? 'Plaintext (UTF-8)' : 'DevFusion AES ciphertext (Base64)'}
            onRun={() => void run()}
            language="text"
            placeholder={mode === 'encrypt' ? 'Plaintext…' : 'Base64 ciphertext…'}
          />
          <CodeEditor value={output} language="text" label={mode === 'encrypt' ? 'Encrypted output (Base64)' : 'Decrypted plaintext'} placeholder={busy ? 'Working…' : hasResult ? 'Empty plaintext' : 'Run to see the result'} readOnly />
        </div>
      </div>

      <footer className="shrink-0 border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={error ? 'danger' : hasResult ? 'success' : 'neutral'}>
          {error ?? (busy ? 'Working on current input…' : hasResult ? `${mode === 'encrypt' ? 'Encrypted' : 'Decrypted'} successfully${output === '' ? ' · empty plaintext' : ''}` : 'Enter a password and run · Ctrl/⌘ + Enter')}
        </ToolStatus>
      </footer>
    </div>
  )
}
