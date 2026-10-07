import { decodeJwt } from '../crypto/jwt'
import type { BoundedResponse, CorsInput, CorsReport, Finding, HeaderReport } from './types'

const get = (headers: Record<string, string>, name: string): string => Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1] ?? ''
export function reviewHeaders(headers: Record<string, string>, https: boolean, status = 200): HeaderReport {
  const findings: Finding[] = []
  const add = (severity: Finding['severity'], rule: string, detail: string): void => { findings.push({ severity, rule, detail }) }
  const csp = get(headers, 'content-security-policy'), hsts = get(headers, 'strict-transport-security'), frame = get(headers, 'x-frame-options').toLowerCase()
  const positiveMaxAge = hsts.split(';').some(directive => {
    const match = /^max-age\s*=\s*(?:([0-9]+)|"([0-9]+)")$/i.exec(directive.trim())
    return !!match && /[1-9]/.test(match[1] ?? match[2])
  })
  if (!https) add('warning', 'transport', 'HTTP provides no TLS protection. Review whether this endpoint requires HTTPS.')
  else if (!positiveMaxAge) add('review', 'hsts', 'A positive HSTS max-age was not observed on HTTPS.')
  else add('pass', 'hsts', 'A positive HSTS max-age was observed; confirm rollout and subdomain requirements separately.')
  if (!csp) add('review', 'csp', 'No enforced Content-Security-Policy observed. This matters especially for browser document responses.')
  else {
    add('pass', 'csp-present', 'An enforced CSP is present. Presence alone does not prove that its policy is effective.')
    if (/'unsafe-(inline|eval)'/i.test(csp)) add('review', 'csp-unsafe', 'CSP contains unsafe-inline or unsafe-eval. Review the affected directives and nonce/hash semantics.')
    if (!/(?:^|;)\s*(?:default-src|script-src)\b/i.test(csp)) add('review', 'csp-script', 'No default-src or script-src directive observed.')
  }
  if (/^(deny|sameorigin)$/.test(frame) || /(?:^|;)\s*frame-ancestors\s+[^;]+/i.test(csp)) add('pass', 'framing', 'A framing policy is declared; inspect allowed ancestors separately.')
  else add('review', 'framing', 'No recognized framing protection observed. Public APIs may have different requirements from HTML pages.')
  if (get(headers, 'x-content-type-options').trim().toLowerCase() === 'nosniff') add('pass', 'nosniff', 'MIME sniffing is disabled.')
  else add('review', 'nosniff', 'X-Content-Type-Options: nosniff is missing or unrecognized.')
  const recognized = ['no-referrer', 'no-referrer-when-downgrade', 'origin', 'origin-when-cross-origin', 'same-origin', 'strict-origin', 'strict-origin-when-cross-origin', 'unsafe-url']
  const referrer = get(headers, 'referrer-policy').toLowerCase().split(',').map(value => value.trim()).filter(value => recognized.includes(value)).at(-1)
  if (!referrer || ['unsafe-url', 'no-referrer-when-downgrade'].includes(referrer)) add('review', 'referrer', 'Referrer policy is missing or may expose URL information; review browser defaults and endpoint needs.')
  else add('pass', 'referrer', 'An explicit referrer policy is declared; verify its semantics for the application.')
  if (get(headers, 'server') || get(headers, 'x-powered-by')) add('review', 'fingerprint', 'Server/platform identification headers are exposed. Their presence is not itself an exploit.')
  if (status >= 300 && status < 400) add('review', 'redirect', 'This is a redirect response; the destination was not followed or reviewed.')
  return { status, findings, observed: ['content-security-policy', 'strict-transport-security', 'x-frame-options', 'x-content-type-options', 'referrer-policy', 'permissions-policy', 'server', 'x-powered-by'].filter(name => !!get(headers, name)) }
}

export function reviewCors(input: CorsInput, preflight: BoundedResponse, sample: BoundedResponse): CorsReport {
  const findings: Finding[] = [], add = (severity: Finding['severity'], rule: string, detail: string): void => { findings.push({ severity, rule, detail }) }
  for (const [name, response] of [['preflight', preflight], ['GET sample', sample]] as const) {
    const allow = get(response.headers, 'access-control-allow-origin').trim(), credentials = get(response.headers, 'access-control-allow-credentials').trim() === 'true'
    if (!allow) add('review', name + '-origin', 'No Access-Control-Allow-Origin observed. Cross-origin browser access for the supplied origin is not granted by this response.')
    else if (allow === '*' && input.credentials) add('warning', name + '-wildcard-credentials', 'Wildcard origin is incompatible with credentialed browser access; browsers block this combination.')
    else if (allow !== '*' && allow !== input.origin) add('review', name + '-origin', 'The supplied origin does not match the allowed origin.')
    else {
      add('pass', name + '-origin', 'The supplied origin is allowed by this response; confirm that this is intentional.')
      if (allow === '*') add('review', name + '-public', 'Any origin can read non-credentialed responses. This can be intentional for public resources.')
      if (allow === input.origin && credentials) add('review', name + '-credentialed', 'The supplied origin is allowed with credentials. One origin probe cannot establish arbitrary-origin reflection or data exposure.')
    }
    if (input.credentials && !credentials) add('review', name + '-credentials', 'Access-Control-Allow-Credentials: true is absent; credentialed browser access is not granted.')
    const vary = get(response.headers, 'vary').toLowerCase().split(',').map(value => value.trim())
    if (allow && allow !== '*' && !vary.includes('origin') && !vary.includes('*')) add('review', name + '-vary', 'Vary: Origin is absent. Review shared-cache behavior if origin responses vary.')
    if (response.status >= 300 && response.status < 400) add('review', name + '-redirect', 'Redirect was not followed; this probe does not assess the redirected resource.')
  }
  const methods = get(preflight.headers, 'access-control-allow-methods').split(',').map(value => value.trim())
  const headers = get(preflight.headers, 'access-control-allow-headers').toLowerCase().split(',').map(value => value.trim())
  if (preflight.status < 200 || preflight.status >= 300) add('review', 'preflight-status', 'Preflight did not return a successful status.')
  if (!['GET', 'HEAD', 'POST'].includes(input.method) && !methods.includes(input.method) && !(methods.includes('*') && !input.credentials)) add('review', 'preflight-method', 'Requested non-safelisted method is not allowed by the observed preflight policy.')
  if (input.headers.some(header => !headers.includes(header.toLowerCase()) && !(headers.includes('*') && !input.credentials && header.toLowerCase() !== 'authorization'))) add('review', 'preflight-headers', 'At least one requested header is not allowed by the observed preflight policy.')
  return { preflightStatus: preflight.status, sampleStatus: sample.status, findings }
}

export function reviewJwt(token: string, policy: { algorithms: string[]; issuer: string; audience: string; maxLifetimeSeconds: number }, now = Date.now() / 1000): { findings: Finding[]; signatureVerified: false } {
  if (token.length > 65536) throw new Error('JWT limit: 64 Ki characters.')
  const decoded = decodeJwt(token)
  if (!decoded.ok) throw new Error('Invalid compact JWT; header/payload values are omitted from this error.')
  if (!policy.algorithms.length || policy.algorithms.length > 20 || !Number.isInteger(policy.maxLifetimeSeconds) || policy.maxLifetimeSeconds < 1 || policy.maxLifetimeSeconds > 604800) throw new Error('Choose an algorithm allowlist and lifetime from 1–604800 seconds.')
  const findings: Finding[] = [], add = (severity: Finding['severity'], rule: string, detail: string): void => { findings.push({ severity, rule, detail }) }
  const header = decoded.header, payload = decoded.payload, alg = decoded.algorithm
  if (!alg || alg.toLowerCase() === 'none' || !decoded.signature) add('warning', 'unsigned', 'Token has no supported signing declaration or signature. Applications must reject unsigned tokens unless explicitly designed otherwise.')
  if (!alg || !policy.algorithms.includes(alg)) add('warning', 'algorithm', 'Token algorithm is outside the configured allowlist. The verifier must independently pin allowed algorithms.')
  if (['jku', 'x5u', 'jwk'].some(key => Object.hasOwn(header, key))) add('review', 'key-source', 'Token supplies a key or key-source hint. Do not trust it without a verifier-controlled allowlist; no URL is fetched here.')
  if (Object.hasOwn(header, 'crit') || header.b64 === false) add('review', 'extensions', 'Critical or unencoded-payload extensions require explicit verifier support.')
  const exp = payload.exp, iat = payload.iat, nbf = payload.nbf
  if (typeof exp !== 'number' || !Number.isFinite(exp)) add('warning', 'expiry', 'Missing or invalid expiry claim.')
  else if (exp <= now) add('warning', 'expired', 'Token expiry has passed according to the local clock.')
  else add('pass', 'expiry', 'Expiry is in the future according to the local clock; signature and clock policy still require verification.')
  if (typeof iat !== 'number' || !Number.isFinite(iat)) add('review', 'issued-at', 'Issued-at claim is missing or invalid; total declared lifetime cannot be assessed.')
  else {
    if (iat > now + 30) add('review', 'future-issued', 'Issued-at is more than 30 seconds in the future.')
    if (typeof exp === 'number' && (exp < iat || exp - iat > policy.maxLifetimeSeconds)) add('review', 'lifetime', 'Declared lifetime is negative or exceeds the configured maximum.')
  }
  if (nbf !== undefined && (typeof nbf !== 'number' || !Number.isFinite(nbf) || nbf > now + 30)) add('review', 'not-before', 'Not-before is invalid or more than 30 seconds in the future.')
  if (!policy.issuer) add('review', 'issuer-policy', 'Configure an expected issuer to assess issuer matching.')
  else if (payload.iss !== policy.issuer) add('warning', 'issuer', 'Issuer does not match the expected value.')
  if (!policy.audience) add('review', 'audience-policy', 'Configure an expected audience to assess audience matching.')
  else if (!(payload.aud === policy.audience || (Array.isArray(payload.aud) && payload.aud.includes(policy.audience)))) add('warning', 'audience', 'Audience does not match the expected value.')
  return { findings, signatureVerified: false }
}
