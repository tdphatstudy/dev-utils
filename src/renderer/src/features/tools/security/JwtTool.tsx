import { messageKey } from '@shared/i18n/message-key'
import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAsyncValue } from '@renderer/hooks/useAsyncValue'
import { parseJson } from '@shared/json'
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
  type HsAlgorithm
} from '@shared/crypto/jwt'
import { cn } from '@renderer/lib/utils'

type Mode = 'decode' | 'verify' | 'sign'

const DEFAULT_PAYLOAD = `{
  "sub": "1234567890",
  "name": "DevFusion",
  "iat": ${Math.floor(Date.now() / 1000)},
  "exp": ${Math.floor(Date.now() / 1000) + 3600}
}`

export default function JwtTool(): JSX.Element {
  useUiLocale()
  const [mode, setMode] = useState<Mode>('verify')
  const [token, setToken] = useState('')
  const [secret, setSecret] = useState(JWT_SAMPLE_SECRET)
  const [showSecret, setShowSecret] = useState(false)
  const [payloadEdit, setPayloadEdit] = useState(DEFAULT_PAYLOAD)
  const [signAlg, setSignAlg] = useState<HsAlgorithm>('HS256')
  const [signedOut, setSignedOut] = useState('')
  const [busy, setBusy] = useState(false)
  const [operationError, setOperationError] = useState<string | null>(null)
  const revision = useRef(0)
  const mounted = useRef(true)
  const running = useRef(false)
  const [signedInput, setSignedInput] = useState('')
  const inputIdentity = JSON.stringify([payloadEdit, secret, signAlg])
  const currentSigned = signedInput === inputIdentity ? signedOut : ''
  const payloadParsed = useMemo(() => parseJson(payloadEdit), [payloadEdit])
  const payloadValid = payloadParsed.ok && payloadParsed.value !== null && typeof payloadParsed.value === 'object' && !Array.isArray(payloadParsed.value)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; revision.current++ }
  }, [])
  useEffect(() => { revision.current++; setOperationError(null) }, [token, secret, payloadEdit, signAlg, mode])

  const decoded = useMemo(() => decodeJwt(token), [token])

  const computeVerify = useCallback(async () => mode === 'verify' && token.trim() ? verifyJwt(token, secret) : null, [token, secret, mode])
  const verification = useAsyncValue(computeVerify)
  const currentVerify = verification.value ?? null

  const headerText = decoded.ok ? JSON.stringify(decoded.header, null, 2) : ''
  const payloadText = decoded.ok ? JSON.stringify(decoded.payload, null, 2) : ''

  const onSign = async (): Promise<void> => {
    if (running.current || !payloadValid || !secret) return
    running.current = true
    const version = revision.current
    setBusy(true)
    setOperationError(null)
    try {
      let payload: Record<string, unknown>
      try {
        payload = JSON.parse(payloadEdit) as Record<string, unknown>
      } catch {
        setSignedOut('')
        setOperationError('Payload is not valid JSON')
        return
      }
      const r = await signJwt({ payload, secret, algorithm: signAlg })
      if (!mounted.current || version !== revision.current) return
      if (r.ok) {
        setSignedOut(r.token)
        setSignedInput(inputIdentity)
        setToken(r.token)
      } else {
        setSignedOut('')
        setOperationError(r.error)
      }
    } catch (error) {
      if (mounted.current && version === revision.current) setOperationError(error instanceof Error ? error.message : 'Signing failed')
    } finally {
      running.current = false
      if (mounted.current) setBusy(false)
    }
  }

  const loadSample = async (): Promise<void> => {
    if (running.current) return
    const version = revision.current
    running.current = true
    setBusy(true)
    try {
      const t = await createSampleJwt()
      if (!mounted.current || version !== revision.current) return
      setSecret(JWT_SAMPLE_SECRET); setToken(t); setMode('verify')
    } catch (error) { if (mounted.current) setOperationError(error instanceof Error ? error.message : 'Sample failed') }
    finally { running.current = false; if (mounted.current) setBusy(false) }
  }

  const alg = decoded.ok ? decoded.algorithm : undefined
  const needsPem = mode === 'verify' && (alg?.startsWith('RS') || alg?.startsWith('ES'))

  const status = (() => {
    if (operationError) return { tone: 'danger' as const, text: operationError }
    if (mode === 'sign') {
      if (currentSigned) return { tone: 'success' as const, text: `Signed · ${signAlg}` }
      return { tone: 'neutral' as const, text: 'Edit payload + secret, then Sign' }
    }
    if (!token.trim()) return { tone: 'neutral' as const, text: 'Paste a token or load Sample' }
    if (!decoded.ok) return { tone: 'danger' as const, text: decoded.error }
    if (mode === 'decode') return { tone: 'neutral' as const, text: 'Decoded only — signature not checked' }
    if (verification.pending) return { tone: 'neutral' as const, text: 'Verifying…' }
    if (verification.error) return { tone: 'danger' as const, text: verification.error }
    const verifyResult = currentVerify
    if (!verifyResult) return { tone: 'neutral' as const, text: '…' }
    if (!verifyResult.ok) return { tone: 'danger' as const, text: verifyResult.error }

    const parts: string[] = [verifyResult.algorithm]
    if (verifyResult.valid) parts.push('signature valid')
    else parts.push(verifyResult.reason ?? 'signature invalid')

    if (decoded.expired) parts.push('expired')
    else if (decoded.expiresAt) parts.push('not expired')
    if (decoded.notYetValid) parts.push('nbf in future')

    const tone = verifyResult.valid
      ? decoded.expired || decoded.notYetValid || decoded.claimWarnings.length
        ? ('warning' as const)
        : ('success' as const)
      : secret.trim()
        ? ('danger' as const)
        : ('warning' as const)

    return { tone, text: parts.join(' · ') }
  })()

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ToolToolbar>
        <SegmentedControl
          value={mode}
          onChange={setMode}
          options={[
            { value: 'decode', label: messageKey('Decode') },
            { value: 'verify', label: messageKey('Verify') },
            { value: 'sign', label: messageKey('Sign (HS)') }
          ]}
        />
        <button type="button" disabled={busy} className="mac-btn-ghost" onClick={() => void loadSample()}>
          {uiText('Sample')}</button>
        <div className="ml-auto flex gap-2">
          <CopyButton text={mode === 'sign' ? currentSigned : token} label={uiText('Copy token')} />
          <CopyButton text={mode === 'sign' ? payloadValid ? payloadEdit : '' : payloadText} label={uiText('Copy payload')} />
        </div>
      </ToolToolbar>

      {/* Secret / key */}
      {mode !== 'decode' && <div className="space-y-2 border-b border-mac-separator px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="jwt-secret" className="text-[11px] font-semibold uppercase tracking-wide text-mac-label-tertiary">
            {needsPem ? uiText('Public key (PEM)') : uiText('Secret / key')}
            {mode === 'sign' ? ` ${uiText('(HMAC secret)')}` : ''}
          </label>
          <span className="text-[11px] text-mac-label-tertiary">
            {uiText('Stays local · never saved to disk')}</span>
        </div>
        <div className="relative">
          {needsPem ? (
            <textarea
              id="jwt-secret"
              className="mac-input min-h-[88px] resize-y font-mono text-[12px]"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              spellCheck={false}
              placeholder={
                needsPem
                  ? '-----BEGIN PUBLIC KEY-----\n…\n-----END PUBLIC KEY-----'
                  : uiText('HMAC secret or PEM public key')
              }
            />
          ) : (
            <div className="flex gap-2">
              <input
                id="jwt-secret"
                type={showSecret ? 'text' : 'password'}
                className="mac-input flex-1 font-mono text-[13px]"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                placeholder={uiText('Enter shared secret (HS256/384/512)')}
              />
              <button
                type="button"
                className="mac-btn-secondary !px-2.5"
                onClick={() => setShowSecret((s) => !s)}
                title={showSecret ? uiText('Hide') : uiText('Show')}
                aria-label={showSecret ? uiText('Hide JWT secret') : uiText('Show JWT secret')}
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
            <span className="text-[11px] text-mac-label-tertiary">{uiText('Algorithm')}</span>
            {(['HS256', 'HS384', 'HS512'] as HsAlgorithm[]).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setSignAlg(a)}
                aria-pressed={signAlg === a}
                className={cn(
                  'rounded-mac px-2 py-1 font-mono text-[11px] font-medium',
                  signAlg === a
                    ? 'bg-mac-accent-fill text-white'
                    : 'bg-mac-control text-mac-label-secondary hover:bg-mac-control-hover'
                )}
              >
                {a}
              </button>
            ))}
            <button
              type="button"
              className="mac-btn-primary ml-auto"
              disabled={busy || !secret || !payloadValid}
              onClick={() => void onSign()}
            >
              {uiText('Sign JWT')}</button>
          </div>
        )}
        {mode !== 'sign' && (
          <p className="text-[11px] text-mac-label-tertiary">
            <strong className="text-mac-label-secondary">HS</strong> {uiText('→ shared secret string ·')}{' '}
            <strong className="text-mac-label-secondary">{uiText('RS / ES')}</strong> {uiText('→ paste PEM public key (auto-expands). Signature is checked with Web Crypto.')}</p>
        )}
      </div>}
      <p className="shrink-0 border-b border-mac-separator px-4 py-2 text-[11px] text-mac-label-secondary">{mode === 'decode' ? uiText('Decoded claims are untrusted. No key is used in Decode mode.') : uiText('Signature verification does not validate issuer, audience or application authorization. No remote key URLs are fetched.')}</p>
      {decoded.ok && mode !== 'sign' && decoded.claimWarnings.map((warning) => <p key={warning} role="alert" className="px-4 py-1 text-[12px] text-mac-warning">{warning}</p>)}
      {mode === 'sign' && payloadParsed.ok && !payloadValid && <p role="alert" className="px-4 py-2 text-[12px] text-mac-danger">{uiText('Payload must be a JSON object, not an array, null or primitive.')}</p>}

      <div className="grid min-h-0 flex-1 gap-3 overflow-auto p-3">
        {mode === 'sign' ? (
          <div className="grid min-h-0 flex-1 auto-rows-[minmax(200px,1fr)] grid-cols-1 gap-3 md:grid-cols-2">
            <div className="flex min-h-0 flex-col gap-1">
              <span className="px-1 text-[11px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
                {uiText('Payload (JSON)')}</span>
              <CodeEditor
                value={payloadEdit}
                onChange={setPayloadEdit}
                language="json"
                placeholder="{ }"
                label={uiText('JWT payload JSON')}
                onRun={() => void onSign()}
              />
            </div>
            <div className="flex min-h-0 flex-col gap-1">
              <span className="px-1 text-[11px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
                {uiText('Signed token')}</span>
              <CodeEditor
                value={currentSigned}
                language="text"
                readOnly
                placeholder={uiText('Click Sign JWT…')}
                label={uiText('Signed JWT')}
              />
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-rows-[minmax(110px,0.35fr)_minmax(180px,1fr)] gap-3">
            <div className="flex min-h-0 flex-col gap-1">
              <span className="px-1 text-[11px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
                {uiText('Token')} {token.trim().toLowerCase().startsWith('bearer ') ? uiText('(Bearer stripped)') : ''}
              </span>
              <CodeEditor
                value={token}
                onChange={setToken}
                language="text"
                placeholder={uiText('Paste JWT… (Bearer prefix ok)')}
                label={uiText('JWT token')}
              />
            </div>
            <div className="grid min-h-0 grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex min-h-0 flex-col gap-1">
                <span className="px-1 text-[11px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
                  {uiText('Header')}</span>
                <CodeEditor value={headerText} language="json" readOnly />
              </div>
              <div className="flex min-h-0 flex-col gap-1">
                <span className="px-1 text-[11px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
                  {uiText('Payload')}</span>
                <CodeEditor value={payloadText} language="json" readOnly />
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-mac-separator px-4 py-2 text-[12px]">
        <ToolStatus tone={status.tone}>{status.text}</ToolStatus>
        {decoded.ok && (
          <>
            {decoded.issuedAt && (
              <span className="text-mac-label-secondary">{uiText('iat')} {decoded.issuedAt}</span>
            )}
            {decoded.expiresAt && (
              <span className="text-mac-label-secondary">{uiText('exp')} {decoded.expiresAt}</span>
            )}
            {decoded.notBefore && (
              <span className="text-mac-label-secondary">nbf {decoded.notBefore}</span>
            )}
            {mode === 'verify' && currentVerify?.ok && currentVerify.valid && (
              <span className="font-medium text-mac-success">{uiText('✓ signature OK')}</span>
            )}
            {mode === 'verify' && currentVerify?.ok && !currentVerify.valid && (
              <span className="font-medium text-mac-danger">{uiText('Signature not verified')}</span>
            )}
          </>
        )}
      </footer>
    </div>
  )
}
