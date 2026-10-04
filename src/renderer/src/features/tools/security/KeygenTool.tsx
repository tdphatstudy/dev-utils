import { useState } from 'react'
import { RefreshCw, AlertTriangle } from 'lucide-react'
import type { KeygenAlgorithm, KeygenResult } from '@shared/crypto/keygen-types'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { SplitPane } from '@renderer/components/ui/SplitPane'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'

const ALGS: { id: KeygenAlgorithm; label: string }[] = [
  { id: 'ed25519', label: 'Ed25519' },
  { id: 'rsa', label: 'RSA' },
  { id: 'ec-p256', label: 'ECDSA P-256' },
  { id: 'ec-p384', label: 'ECDSA P-384' },
  { id: 'ec-p521', label: 'ECDSA P-521' },
  { id: 'x25519', label: 'X25519 (agreement)' }
]

export default function KeygenTool(): JSX.Element {
  const [algorithm, setAlgorithm] = useState<KeygenAlgorithm>('ed25519')
  const [modulus, setModulus] = useState<2048 | 3072 | 4096>(2048)
  const [comment, setComment] = useState('devutils@local')
  const [result, setResult] = useState<KeygenResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generate = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const r = await window.devutils.crypto.generateKeyPair({
        algorithm,
        modulusLength: algorithm === 'rsa' ? modulus : undefined,
        comment
      })
      setResult(r)
    } catch (e) {
      setResult(null)
      setError(e instanceof Error ? e.message : 'Key generation failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ToolToolbar>
        <label className="flex items-center gap-1.5 text-[12px] text-mac-label-secondary">
          Algorithm
          <select
            className="mac-input !w-auto max-w-[11rem] !py-1"
            value={algorithm}
            onChange={(e) => setAlgorithm(e.target.value as KeygenAlgorithm)}
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
            Bits
            <select
              className="mac-input !w-auto !py-1"
              value={modulus}
              onChange={(e) => setModulus(Number(e.target.value) as 2048 | 3072 | 4096)}
            >
              <option value={2048}>2048</option>
              <option value={3072}>3072</option>
              <option value={4096}>4096</option>
            </select>
          </label>
        )}

        <label className="flex items-center gap-1.5 text-[12px] text-mac-label-secondary">
          Comment
          <input
            className="mac-input !w-36 !py-1 font-mono text-[12px]"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="user@host"
            spellCheck={false}
          />
        </label>

        <button
          type="button"
          className="mac-btn-primary"
          disabled={busy}
          onClick={() => void generate()}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
          {busy ? 'Generating…' : 'Generate'}
        </button>

        {result && (
          <div className="ml-auto flex flex-wrap gap-2">
            <CopyButton text={result.privateKeyPem} label="Copy private PEM" />
            <CopyButton text={result.publicKeyPem} label="Copy public PEM" />
            {result.publicKeyOpenSsh && (
              <CopyButton text={result.publicKeyOpenSsh} label="Copy OpenSSH pub" />
            )}
          </div>
        )}
      </ToolToolbar>

      <div className="flex items-start gap-2 border-b border-mac-separator bg-mac-warning/10 px-4 py-2 text-[12px] text-mac-label-secondary">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mac-warning" />
        <span>
          Keys are generated locally in the main process and are <strong>not</strong> written to disk
          unless you copy/save them. Treat the private key as secret. X25519 is for key agreement only
          (no OpenSSH public line).
        </span>
      </div>

      {result ? (
        <>
          <div className="flex flex-wrap gap-3 border-b border-mac-separator px-4 py-2 text-[12px]">
            <span className="font-medium text-mac-label">{result.label}</span>
            <span className="font-mono text-mac-label-secondary">{result.fingerprintSha256}</span>
            <span className="font-mono text-[11px] text-mac-label-tertiary">
              hex {result.fingerprintHex.slice(0, 16)}…
            </span>
          </div>
          <SplitPane>
            <div className="flex min-h-0 flex-col gap-1">
              <span className="px-1 text-[11px] font-semibold uppercase tracking-wider text-mac-danger">
                Private (PKCS#8 PEM)
              </span>
              <CodeEditor value={result.privateKeyPem} language="text" readOnly className="min-h-0 flex-1" />
            </div>
            <div className="flex min-h-0 flex-col gap-1">
              <span className="px-1 text-[11px] font-semibold uppercase tracking-wider text-mac-success">
                Public (SPKI PEM)
              </span>
              <CodeEditor value={result.publicKeyPem} language="text" readOnly className="min-h-0 flex-1" />
            </div>
          </SplitPane>
          {result.publicKeyOpenSsh && (
            <div className="shrink-0 border-t border-mac-separator px-3 py-2">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
                OpenSSH public
              </div>
              <code className="selectable block break-all rounded-mac border border-mac-separator bg-mac-control px-2 py-1.5 font-mono text-[11px] text-mac-label">
                {result.publicKeyOpenSsh}
              </code>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center text-[13px] text-mac-label-tertiary">
          Choose an algorithm and click Generate
        </div>
      )}

      <footer className="border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={error ? 'danger' : result ? 'success' : 'neutral'}>
          {error ??
            (result
              ? `Generated ${result.label} · fingerprint ready · user-initiated`
              : 'RSA · ECDSA · Ed25519 · X25519 · local Node crypto')}
        </ToolStatus>
      </footer>
    </div>
  )
}
