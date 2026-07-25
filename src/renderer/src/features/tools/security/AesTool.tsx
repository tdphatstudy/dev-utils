import { useState } from 'react'
import { aesGcmDecrypt, aesGcmEncrypt } from '@shared/crypto/aes'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'

type Mode = 'encrypt' | 'decrypt'

export default function AesTool(): JSX.Element {
  const [mode, setMode] = useState<Mode>('encrypt')
  const [password, setPassword] = useState('')
  const [input, setInput] = useState('Secret message for DevUtils')
  const [output, setOutput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      if (mode === 'encrypt') {
        const r = await aesGcmEncrypt(input, password)
        if (!r.ok) setError(r.error)
        else setOutput(r.ciphertext)
      } else {
        const r = await aesGcmDecrypt(input, password)
        if (!r.ok) setError(r.error)
        else setOutput(r.plaintext)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ToolToolbar>
        <SegmentedControl
          value={mode}
          onChange={setMode}
          options={[
            { value: 'encrypt', label: 'Encrypt' },
            { value: 'decrypt', label: 'Decrypt' }
          ]}
        />
        <button type="button" className="mac-btn-primary" disabled={busy} onClick={run}>
          {busy ? 'Working…' : mode === 'encrypt' ? 'Encrypt' : 'Decrypt'}
        </button>
        <div className="ml-auto">
          <CopyButton text={output} />
        </div>
      </ToolToolbar>

      <div className="grid min-h-0 flex-1 grid-rows-[auto_1fr] gap-3 p-3">
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
            Password (PBKDF2 → AES-256-GCM)
          </label>
          <input
            className="mac-input font-mono"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Passphrase — never leaves this machine"
            autoComplete="off"
          />
          <p className="mt-1 text-[11px] text-mac-label-tertiary">
            Output packs salt + IV + ciphertext as Base64. Use the same password to decrypt.
          </p>
        </div>
        <div className="grid min-h-0 grid-cols-2 gap-3">
          <CodeEditor
            value={input}
            onChange={setInput}
            language="text"
            placeholder={mode === 'encrypt' ? 'Plaintext…' : 'Base64 ciphertext…'}
          />
          <CodeEditor value={output} language="text" readOnly />
        </div>
      </div>

      <footer className="border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={error ? 'danger' : output ? 'success' : 'neutral'}>
          {error ?? (output ? 'AES-GCM · Web Crypto' : 'Enter password and run')}
        </ToolStatus>
      </footer>
    </div>
  )
}
