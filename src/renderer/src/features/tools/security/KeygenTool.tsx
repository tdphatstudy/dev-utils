import { messageKey } from '@shared/i18n/message-key'
import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useEffect, useRef, useState } from 'react'
import { RefreshCw, AlertTriangle } from 'lucide-react'
import type { KeygenAlgorithm, KeygenResult } from '@shared/crypto/keygen-types'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { SplitPane } from '@renderer/components/ui/SplitPane'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'

const ALGS: { id: KeygenAlgorithm; label: string }[] = [
  { id: 'ed25519', label: messageKey('Ed25519') },
  { id: 'rsa', label: messageKey('RSA') },
  { id: 'ec-p256', label: messageKey('ECDSA P-256') },
  { id: 'ec-p384', label: messageKey('ECDSA P-384') },
  { id: 'ec-p521', label: messageKey('ECDSA P-521') },
  { id: 'x25519', label: messageKey('X25519 (agreement)') }
]

export default function KeygenTool(): JSX.Element {
  useUiLocale()
  const [algorithm, setAlgorithm] = useState<KeygenAlgorithm>('ed25519')
  const [modulus, setModulus] = useState<2048 | 3072 | 4096>(2048)
  const [comment, setComment] = useState('devfusion@local')
  const [result, setResult] = useState<KeygenResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPrivate, setShowPrivate] = useState(false)
  const request = useRef(0)
  const running = useRef(false)
  const available = !!window.devutils?.crypto
  const commentError = comment.length > 256 || /[\r\n\0]/.test(comment) ? 'Comment must be one line, at most 256 characters.' : null
  useEffect(() => () => { request.current++ }, [])
  const clear = (): void => { setResult(null); setShowPrivate(false); setError(null) }

  const generate = async (): Promise<void> => {
    if (running.current || !available || commentError) return
    running.current = true
    const version = ++request.current
    clear()
    setBusy(true)
    setError(null)
    try {
      const r = await window.devutils.crypto.generateKeyPair({
        algorithm,
        modulusLength: algorithm === 'rsa' ? modulus : undefined,
        comment
      })
      if (version === request.current) setResult(r)
    } catch (e) {
      if (version === request.current) {
        setResult(null)
        setError(e instanceof Error ? e.message : 'Key generation failed')
      }
    } finally {
      running.current = false
      if (version === request.current) setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ToolToolbar>
        <label className="flex items-center gap-1.5 text-[12px] text-mac-label-secondary">
          {uiText('Algorithm')}<select
            className="mac-input !w-auto max-w-[11rem] !py-1"
            value={algorithm}
            disabled={busy}
            onChange={(e) => { clear(); setAlgorithm(e.target.value as KeygenAlgorithm) }}
          >
            {ALGS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>

        {algorithm === 'rsa' && (
          <label className="flex items-center gap-1.5 text-[12px] text-mac-label-secondary">
            {uiText('Bits')}<select
              className="mac-input !w-auto !py-1"
              value={modulus}
              disabled={busy}
              onChange={(e) => { clear(); setModulus(Number(e.target.value) as 2048 | 3072 | 4096) }}
            >
              <option value={2048}>2048</option>
              <option value={3072}>3072</option>
              <option value={4096}>4096</option>
            </select>
          </label>
        )}

        <label className="flex items-center gap-1.5 text-[12px] text-mac-label-secondary">
          {uiText('Comment')}<input
            className="mac-input !w-36 !py-1 font-mono text-[12px]"
            value={comment}
            disabled={busy}
            maxLength={256}
            onChange={(e) => { clear(); setComment(e.target.value) }}
            placeholder={uiText('user@host')}
            spellCheck={false}
          />
        </label>

        <button
          type="button"
          className="mac-btn-primary"
          disabled={busy || !available || !!commentError}
          onClick={() => void generate()}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
          {busy ? uiText('Generating…') : uiText('Generate')}
        </button>
        {result && <button type="button" className="mac-btn-secondary" onClick={clear}>{uiText('Clear keys')}</button>}

        {result && (
          <div className="ml-auto flex flex-wrap gap-2">
            <CopyButton text={result.privateKeyPem} label={uiText('Copy private PEM')} />
            <CopyButton text={result.publicKeyPem} label={uiText('Copy public PEM')} />
            {result.publicKeyOpenSsh && (
              <CopyButton text={result.publicKeyOpenSsh} label={uiText('Copy OpenSSH pub')} />
            )}
          </div>
        )}
      </ToolToolbar>

      <div className="flex items-start gap-2 border-b border-mac-separator bg-mac-warning/10 px-4 py-2 text-[12px] text-mac-label-secondary">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mac-warning" />
        <span>
          {uiText('Keys are generated locally and stay in memory until you clear them or leave this tool. Copy private PEM only when you need it. X25519 is for key agreement only (no OpenSSH public line).')}</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto" aria-busy={busy}>
      {result ? (
        <>
          <div className="flex flex-wrap gap-3 border-b border-mac-separator px-4 py-2 text-[12px]">
            <span className="font-medium text-mac-label">{result.label}</span>
            <span className="break-all font-mono text-mac-label-secondary">{uiText('SPKI')} {result.fingerprintSha256}</span>
            {result.fingerprintOpenSshSha256 && <span className="break-all font-mono text-mac-label-secondary">{uiText('OpenSSH')} {result.fingerprintOpenSshSha256}</span>}
          </div>
          <SplitPane className="min-h-[320px] shrink-0">
            <div className="flex min-h-0 flex-col gap-1">
              <span className="px-1 text-[11px] font-semibold uppercase tracking-wider text-mac-danger">
                {uiText('Private (PKCS#8 PEM)')}</span>
              <button type="button" className="mac-btn-secondary self-start" aria-pressed={showPrivate} onClick={() => setShowPrivate(!showPrivate)}>{showPrivate ? uiText('Hide private key') : uiText('Reveal private key')}</button>
              {showPrivate ? <CodeEditor value={result.privateKeyPem} label={uiText('Private PKCS#8 key')} language="text" readOnly className="min-h-0 flex-1" /> : <div className="flex min-h-24 flex-1 items-center justify-center rounded-mac border border-mac-separator text-[12px] text-mac-label-secondary">{uiText('Private key hidden. Use Reveal or Copy private PEM.')}</div>}
            </div>
            <div className="flex min-h-0 flex-col gap-1">
              <span className="px-1 text-[11px] font-semibold uppercase tracking-wider text-mac-success">
                {uiText('Public (SPKI PEM)')}</span>
              <CodeEditor value={result.publicKeyPem} label={uiText('Public SPKI key')} language="text" readOnly className="min-h-0 flex-1" />
            </div>
          </SplitPane>
          {result.publicKeyOpenSsh && (
            <div className="shrink-0 border-t border-mac-separator px-3 py-2">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
                {uiText('OpenSSH public')}</div>
              <code className="selectable block break-all rounded-mac border border-mac-separator bg-mac-control px-2 py-1.5 font-mono text-[11px] text-mac-label">
                {result.publicKeyOpenSsh}
              </code>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center text-[13px] text-mac-label-tertiary">
          {busy ? algorithm === 'rsa' ? uiText('Generating RSA {bits}… This may take a moment.', { bits: modulus }) : uiText('Generating {value1}…', { value1: algorithm }) : available ? uiText('Choose an algorithm and click Generate') : uiText('Open the desktop app to generate keys locally.')}
        </div>
      )}
      </div>

      <footer className="shrink-0 border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={error || commentError ? 'danger' : result ? 'success' : 'neutral'}>
          {error ?? commentError ??
            (busy ? uiText('Generating locally; controls unlock when complete.') : !available ? uiText('Desktop app required') :
            (result
              ? uiText('Generated {label} · fingerprint ready · user-initiated', { label: result.label })
              : uiText('RSA · ECDSA · Ed25519 · X25519 · local Node crypto')))}
        </ToolStatus>
      </footer>
    </div>
  )
}
