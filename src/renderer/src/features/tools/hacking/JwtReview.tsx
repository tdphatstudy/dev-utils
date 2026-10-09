import { ToolTextInput } from '@renderer/components/ui/ToolTextInput'
import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useState } from 'react'
import { reviewJwt } from '@shared/security-testing/review'
import { Field, Findings, Workbench } from './Workbench'

export default function JwtReview(): JSX.Element {
  useUiLocale()
  const [token, setToken] = useState(''), [algorithm, setAlgorithm] = useState('RS256'), [issuer, setIssuer] = useState(''), [audience, setAudience] = useState(''), [lifetime, setLifetime] = useState(3600), [result, setResult] = useState<ReturnType<typeof reviewJwt> | null>(null), [error, setError] = useState<string | null>(null)
  const clear = (): void => { setResult(null); setError(null) }
  return <Workbench purpose={uiText('Review JWT policy. The signature is not verified.')} limits={uiText('Local processing; token ≤64 Ki characters. No remote keys are fetched. Decoded claim values are omitted from reports.')} busy={false} hasResult={Boolean(result)} error={error} network={false}
    toolbar={<div className="flex flex-wrap gap-2"><button type="button" className="mac-btn-primary" onClick={() => { clear(); try { setResult(reviewJwt(token, { algorithms: [algorithm], issuer, audience, maxLifetimeSeconds: lifetime })) } catch { setError('Provide a valid JWT and a lifetime from 1 to 604,800 seconds.') } }}>{uiText('Review JWT policy')}</button>
      <button type="button" className="mac-btn-secondary" onClick={() => { clear(); const encode = (value: unknown): string => btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'); setToken(`${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: 'synthetic-demo', iat: 1700000000, exp: 1700003600 })}.`) }}>{uiText('Load unsigned example')}</button>
      <button type="button" className="mac-btn-ghost" onClick={() => { setToken(''); setIssuer(''); setAudience(''); clear() }}>{uiText('Clear inputs')}</button></div>}
    input={<>
    <div className="space-y-3" onChange={clear}><ToolTextInput label={uiText('JWT token')} value={token} maxLength={65536} onChange={value => { clear(); setToken(value) }} />
      <div className="grid gap-3 grid-cols-2"><Field label={uiText('Expected algorithm')}><select className="mac-input" value={algorithm} onChange={event => setAlgorithm(event.target.value)}>{['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512', 'PS256', 'PS384', 'PS512', 'HS256', 'HS384', 'HS512', 'EdDSA'].map(value => <option key={value}>{value}</option>)}</select></Field>
        <Field label={uiText('Expected issuer')}><input className="mac-input" value={issuer} maxLength={2048} onChange={event => setIssuer(event.target.value)} autoComplete="off" /></Field>
        <Field label={uiText('Expected audience')}><input className="mac-input" value={audience} maxLength={2048} onChange={event => setAudience(event.target.value)} autoComplete="off" /></Field>
        <Field label={uiText('Maximum lifetime (s)')}><input className="mac-input" type="number" min={1} max={604800} value={lifetime} onChange={event => setLifetime(Number(event.target.value))} /></Field></div>
    </div>
    </>}>
    {result && <Findings title={uiText('JWT policy findings')} summary={uiText('Signature NOT verified. Claim observations do not establish token validity or authenticity.')} findings={result.findings} />}
  </Workbench>
}
