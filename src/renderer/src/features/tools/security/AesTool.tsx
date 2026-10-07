import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useEffect, useRef, useState } from 'react'
import { aesGcmDecrypt, aesGcmEncrypt } from '@shared/crypto/aes'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { SplitPane } from '@renderer/components/ui/SplitPane'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'

type Mode = 'encrypt' | 'decrypt'

export default function AesTool(): JSX.Element {
  useUiLocale()
  const [mode, setMode] = useState<Mode>('encrypt')
  const [password, setPassword] = useState('')
  const [passwordTouched, setPasswordTouched] = useState(false)
  const [input, setInput] = useState('Secret message for DevFusion')
  const [output, setOutput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [hasResult, setHasResult] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [activePane, setActivePane] = useState<0 | 1>(0)
  const operation = useRef(0)
  const container = useRef<HTMLDivElement>(null)
  const repairPaneFocus = useRef(false)
  const revealPane = (pane: 0 | 1): void => {
    const focused = document.activeElement
    const panel = focused instanceof HTMLElement ? focused.closest('[role="tabpanel"]') : null
    const target = container.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[pane]
    repairPaneFocus.current = Boolean(panel && container.current?.contains(panel) && target?.getAttribute('aria-controls') !== panel.id)
    setActivePane(pane)
  }
  useEffect(() => {
    if (repairPaneFocus.current) {
      repairPaneFocus.current = false
      const target = container.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
        ?? container.current?.querySelector<HTMLElement>('.cm-content[contenteditable="true"]')
      target?.focus()
    }
  }, [activePane, mode])
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
      const result = mode === 'encrypt'
        ? await aesGcmEncrypt(input, password)
        : await aesGcmDecrypt(input, password)
      if (request !== operation.current) return
      if (!result.ok) { setError(result.error); revealPane(0) }
      else {
        setOutput('ciphertext' in result ? result.ciphertext : result.plaintext)
        setHasResult(true)
        revealPane(1)
      }
    } catch (e) {
      if (request === operation.current) { setError(e instanceof Error ? e.message : 'Operation failed'); revealPane(0) }
    } finally {
      if (request === operation.current) setBusy(false)
    }
  }

  const useOutput = (): void => {
    const next = output
    invalidate()
    setInput(next)
    setMode(mode === 'encrypt' ? 'decrypt' : 'encrypt')
    revealPane(0)
    repairPaneFocus.current = true
  }
  const passwordError = passwordTouched && !password ? 'Enter a password to enable encryption or decryption.' : null

  return (
    <div ref={container} className="flex h-full min-h-0 min-w-0 flex-col overflow-y-auto">
      <ToolToolbar label="AES actions">
        <SegmentedControl value={mode} label="AES operation" onChange={(value) => { invalidate(); setMode(value); revealPane(0) }} options={[
          { value: 'encrypt', label: 'Encrypt' },
          { value: 'decrypt', label: 'Decrypt' }
        ]} />
        <button type="button" className="mac-btn-primary" disabled={busy || !password || (mode === 'decrypt' && !input.trim())} onClick={() => void run()}>
          {busy ? uiText('Working…') : mode === 'encrypt' ? 'Encrypt text' : 'Decrypt text'}
        </button>
        {hasResult && <button type="button" className="mac-btn-secondary" onClick={useOutput}>Use to {mode === 'encrypt' ? 'decrypt' : 'encrypt'}</button>}
        <div className="ml-auto"><CopyButton text={output} label={uiText('Copy output')} /></div>
      </ToolToolbar>

      <div className="shrink-0 border-b border-mac-separator px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <label htmlFor="aes-password" className="shrink-0 text-[13px] font-semibold text-mac-label">Password</label>
          <input id="aes-password" className="mac-input min-w-0 flex-1 font-mono" type={showPassword ? 'text' : 'password'} value={password}
            onChange={(e) => { invalidate(); setPassword(e.target.value) }} onBlur={() => setPasswordTouched(true)}
            placeholder="Enter a password" autoComplete="off" spellCheck={false} aria-required="true" aria-invalid={Boolean(passwordError)} aria-describedby="aes-password-help" />
          <button type="button" className="mac-btn-secondary shrink-0" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button>
        </div>
        <p id="aes-password-help" className={`mt-1 text-[12px] leading-relaxed ${passwordError ? 'text-mac-danger' : 'text-mac-label-secondary'}`}>
          {passwordError ?? 'Required · use the same password to decrypt. Passwords are not saved.'}
        </p>
      </div>

      <div className="flex min-h-[200px] flex-1 flex-col">
      <SplitPane labels={[uiText('Input'), uiText('Output')]} activePane={activePane} onPaneChange={setActivePane}>
        <CodeEditor value={input} onChange={changeInput} label={mode === 'encrypt' ? 'Plaintext (UTF-8)' : 'DevFusion AES ciphertext (Base64)'} onRun={() => void run()} language="text"
          issue={mode === 'decrypt' && error ? { error, hint: 'Check the password and paste the complete Base64 output from this tool.' } : null}
          placeholder={mode === 'encrypt' ? 'Plaintext…' : 'Paste DevFusion AES ciphertext…'} />
        <div className="h-full min-h-0 min-w-0" aria-busy={busy}>
          <CodeEditor value={output} language="text" label={mode === 'encrypt' ? 'Encrypted output (Base64)' : 'Decrypted plaintext'} placeholder={busy ? uiText('Working…') : hasResult ? 'Empty plaintext' : 'Run to see the result'} readOnly />
        </div>
      </SplitPane>
      </div>

      <footer className="shrink-0 border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={error ? 'danger' : hasResult ? 'success' : 'neutral'}>
          {error ?? (busy ? 'Working on current input…' : hasResult ? `${mode === 'encrypt' ? 'Encrypted' : 'Decrypted'} successfully${output === '' ? ' · empty plaintext' : ''}` : !password ? 'Enter a password to get started.' : mode === 'decrypt' && !input.trim() ? 'Paste the complete DevFusion AES ciphertext.' : 'Ready · Ctrl/⌘ + Enter to run')}
        </ToolStatus>
      </footer>
    </div>
  )
}
