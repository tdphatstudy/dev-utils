import { useEffect, useMemo, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import {
  JWT_SAMPLE_SECRET,
  createSampleJwt,
  decodeJwt,
  signJwt,
  verifyJwt,
  type HsAlgorithm,
  type JwtVerifyResult
} from '@shared/crypto/jwt'
import { cn } from '@renderer/lib/utils'

type Mode = 'decode' | 'verify' | 'sign'

const DEFAULT_PAYLOAD = `{
  "sub": "1234567890",
  "name": "DevUtils",
  "iat": ${Math.floor(Date.now() / 1000)},
  "exp": ${Math.floor(Date.now() / 1000) + 3600}
}`

export default function JwtTool(): JSX.Element {
  const [mode, setMode] = useState<Mode>('verify')
  const [token, setToken] = useState('')
  const [secret, setSecret] = useState(JWT_SAMPLE_SECRET)
  const [showSecret, setShowSecret] = useState(false)
  const [payloadEdit, setPayloadEdit] = useState(DEFAULT_PAYLOAD)
  const [signAlg, setSignAlg] = useState<HsAlgorithm>('HS256')
  const [signedOut, setSignedOut] = useState('')
  const [verifyResult, setVerifyResult] = useState<JwtVerifyResult | null>(null)
  const [busy, setBusy] = useState(false)

  // Load a properly signed sample on mount
  useEffect(() => {
    void createSampleJwt().then(setToken)
  }, [])

  const decoded = useMemo(() => decodeJwt(token), [token])

  // Live verify when secret/token changes
  useEffect(() => {
    if (mode !== 'verify' && mode !== 'decode') return
    let cancelled = false
    setBusy(true)
    void verifyJwt(token, secret).then((r) => {
      if (!cancelled) {
        setVerifyResult(r)
        setBusy(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [token, secret, mode])

  const headerText = decoded.ok ? JSON.stringify(decoded.header, null, 2) : ''
  const payloadText = decoded.ok ? JSON.stringify(decoded.payload, null, 2) : ''

  const onSign = async (): Promise<void> => {
    setBusy(true)
    try {
      let payload: Record<string, unknown>
      try {
        payload = JSON.parse(payloadEdit) as Record<string, unknown>
      } catch {
        setSignedOut('')
        setVerifyResult({ ok: false, error: 'Payload is not valid JSON' })
        return
      }
      const r = await signJwt({ payload, secret, algorithm: signAlg })
      if (r.ok) {
        setSignedOut(r.token)
        setToken(r.token)
      } else {
        setSignedOut('')
        setVerifyResult({ ok: false, error: r.error })
      }
    } finally {
      setBusy(false)
    }
  }

  const loadSample = async (): Promise<void> => {
    setSecret(JWT_SAMPLE_SECRET)
    const t = await createSampleJwt()
    setToken(t)
    setMode('verify')
  }

  const alg = decoded.ok ? decoded.algorithm : undefined
  const needsPem = alg?.startsWith('RS') || alg?.startsWith('ES')

  const status = (() => {
    if (!decoded.ok) return { tone: 'danger' as const, text: decoded.error }
    if (mode === 'sign') {
      if (signedOut) return { tone: 'success' as const, text: `Signed · ${signAlg}` }
      return { tone: 'neutral' as const, text: 'Edit payload + secret, then Sign' }
    }
    if (busy) return { tone: 'neutral' as const, text: 'Verifying…' }
    if (!verifyResult) return { tone: 'neutral' as const, text: '…' }
    if (!verifyResult.ok) return { tone: 'danger' as const, text: verifyResult.error }

    const parts: string[] = [verifyResult.algorithm]
    if (verifyResult.valid) parts.push('signature valid')
    else parts.push(verifyResult.reason ?? 'signature invalid')

    if (decoded.expired) parts.push('expired')
    else if (decoded.expiresAt) parts.push('not expired')
    if (decoded.notYetValid) parts.push('nbf in future')

    const tone = verifyResult.valid
      ? decoded.expired || decoded.notYetValid
        ? ('warning' as const)
        : ('success' as const)
      : secret.trim()
        ? ('danger' as const)
        : ('warning' as const)

    return { tone, text: parts.join(' · ') }
  })()

  return (
    <div className="flex h-full flex-col">
      <ToolToolbar>
        <SegmentedControl
          value={mode}
          onChange={setMode}
          options={[
            { value: 'decode', label: 'Decode' },
            { value: 'verify', label: 'Verify' },
            { value: 'sign', label: 'Sign (HS)' }
          ]}
        />
        <button type="button" className="mac-btn-ghost" onClick={() => void loadSample()}>
          Sample
        </button>
        <div className="ml-auto flex gap-2">
          <CopyButton text={mode === 'sign' ? signedOut : token} label="Copy token" />
          <CopyButton text={payloadText} label="Copy payload" />
        </div>
      </ToolToolbar>

      {/* Secret / key */}
      <div className="space-y-2 border-b border-mac-separator px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-mac-label-tertiary">
            {needsPem ? 'Public key (PEM)' : 'Secret / key'}
            {mode === 'sign' ? ' (HMAC secret)' : ''}
          </label>
          <span className="text-[11px] text-mac-label-tertiary">
            Stays local · never saved to disk
          </span>
        </div>
        <div className="relative">
          {needsPem || secret.includes('BEGIN') || secret.length > 80 ? (
            <textarea
              className="mac-input min-h-[88px] resize-y font-mono text-[12px]"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              spellCheck={false}
              placeholder={
                needsPem
                  ? '-----BEGIN PUBLIC KEY-----\n…\n-----END PUBLIC KEY-----'
                  : 'HMAC secret or PEM public key'
              }
            />
          ) : (
            <div className="flex gap-2">
              <input
                type={showSecret ? 'text' : 'password'}
                className="mac-input flex-1 font-mono text-[13px]"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                placeholder="Enter shared secret (HS256/384/512)"
              />
              <button
                type="button"
                className="mac-btn-secondary !px-2.5"
                onClick={() => setShowSecret((s) => !s)}
                title={showSecret ? 'Hide' : 'Show'}
              >
                {showSecret ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          )}
        </div>
        {mode === 'sign' && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-mac-label-tertiary">Algorithm</span>
            {(['HS256', 'HS384', 'HS512'] as HsAlgorithm[]).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setSignAlg(a)}
                className={cn(
                  'rounded-mac px-2 py-1 font-mono text-[11px] font-medium',
                  signAlg === a
                    ? 'bg-mac-accent text-white'
                    : 'bg-mac-control text-mac-label-secondary hover:bg-mac-control-hover'
                )}
              >
                {a}
              </button>
            ))}
            <button
              type="button"
              className="mac-btn-primary ml-auto"
              disabled={busy || !secret.trim()}
              onClick={() => void onSign()}
            >
              Sign JWT
            </button>
          </div>
        )}
        {mode !== 'sign' && (
          <p className="text-[11px] text-mac-label-tertiary">
            <strong className="text-mac-label-secondary">HS</strong> → shared secret string ·{' '}
            <strong className="text-mac-label-secondary">RS / ES</strong> → paste PEM public key
            (auto-expands). Signature is checked with Web Crypto.
          </p>
        )}
      </div>

      <div className="grid min-h-0 flex-1 gap-3 p-3">
        {mode === 'sign' ? (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="flex min-h-0 flex-col gap-1">
              <span className="px-1 text-[11px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
                Payload (JSON)
              </span>
              <CodeEditor
                value={payloadEdit}
                onChange={setPayloadEdit}
                language="json"
                placeholder="{ }"
              />
            </div>
            <div className="flex min-h-0 flex-col gap-1">
              <span className="px-1 text-[11px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
                Signed token
              </span>
              <CodeEditor
                value={signedOut}
                language="text"
                readOnly
                placeholder="Click Sign JWT…"
              />
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-rows-[minmax(90px,0.35fr)_1fr] gap-3">
            <div className="flex min-h-0 flex-col gap-1">
              <span className="px-1 text-[11px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
                Token {token.trim().toLowerCase().startsWith('bearer ') ? '(Bearer stripped)' : ''}
              </span>
              <CodeEditor
                value={token}
                onChange={setToken}
                language="text"
                placeholder="Paste JWT… (Bearer prefix ok)"
              />
            </div>
            <div className="grid min-h-0 grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex min-h-0 flex-col gap-1">
                <span className="px-1 text-[11px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
                  Header
                </span>
                <CodeEditor value={headerText} language="json" readOnly />
              </div>
              <div className="flex min-h-0 flex-col gap-1">
                <span className="px-1 text-[11px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
                  Payload
                </span>
                <CodeEditor value={payloadText} language="json" readOnly />
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-mac-separator px-4 py-2 text-[12px]">
        <ToolStatus tone={status.tone}>{status.text}</ToolStatus>
        {decoded.ok && (
          <>
            {decoded.issuedAt && (
              <span className="text-mac-label-secondary">iat {decoded.issuedAt}</span>
            )}
            {decoded.expiresAt && (
              <span className="text-mac-label-secondary">exp {decoded.expiresAt}</span>
            )}
            {decoded.notBefore && (
              <span className="text-mac-label-secondary">nbf {decoded.notBefore}</span>
            )}
            {verifyResult?.ok && verifyResult.valid && (
              <span className="font-medium text-mac-success">✓ signature OK</span>
            )}
            {verifyResult?.ok && !verifyResult.valid && secret.trim() && (
              <span className="font-medium text-mac-danger">✗ signature mismatch</span>
            )}
          </>
        )}
      </footer>
    </div>
  )
}
