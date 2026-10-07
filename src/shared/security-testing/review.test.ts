import { expect, it } from 'vitest'
import { reviewCors, reviewHeaders, reviewJwt } from './review'
import type { BoundedResponse, CorsInput } from './types'
const response = (headers: Record<string, string>, status = 204): BoundedResponse => ({ headers, status, bytes: 0, truncated: false, timeMs: 10 })
const cors: CorsInput = { url: 'https://api.example.test', origin: 'https://app.example.test', method: 'POST', headers: ['Authorization'], credentials: true }
const rules = (result: { findings: { rule: string }[] }): string[] => result.findings.map(item => item.rule)
it('reviews secure headers without treating presence as a complete audit or echoing values', () => {
  const result = reviewHeaders({ 'Strict-Transport-Security': 'max-age=31536000', 'Content-Security-Policy': "default-src 'self'; script-src 'nonce-private'; frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', Server: 'private-version', 'Set-Cookie': 'private-session' }, true)
  expect(result.findings.filter(item => item.severity === 'pass')).toHaveLength(5)
  expect(rules(result)).toContain('fingerprint')
  expect(JSON.stringify(result)).not.toContain('private')
})
it('flags plaintext transport, missing protections and unfollowed redirects', () => {
  expect(rules(reviewHeaders({}, false, 302))).toEqual(expect.arrayContaining(['transport', 'csp', 'framing', 'nosniff', 'referrer', 'redirect']))
  expect(rules(reviewHeaders({ 'Strict-Transport-Security': 'max-age=0', 'Content-Security-Policy': "script-src 'unsafe-inline' 'nonce-private'" }, true))).toContain('csp-unsafe')
})
it('does not approve malformed HSTS or unknown referrer policies', () => {
  for (const value of ['not-max-age=1000', 'max-age=1000garbage', 'max-age=-1', 'max-age="1000']) {
    expect(reviewHeaders({ 'strict-transport-security': value, 'referrer-policy': 'unknown' }, true).findings.filter(item => ['hsts', 'referrer'].includes(item.rule)).every(item => item.severity === 'review')).toBe(true)
  }
  expect(reviewHeaders({ 'strict-transport-security': 'max-age="00010"; includeSubDomains', 'referrer-policy': 'unsafe-url, unknown, no-referrer' }, true).findings.filter(item => ['hsts', 'referrer'].includes(item.rule)).every(item => item.severity === 'pass')).toBe(true)
})
it('recognizes wildcard plus credentials as browser-blocked, without alleging a leak', () => {
  const result = reviewCors(cors, response({ 'access-control-allow-origin': '*', 'access-control-allow-credentials': 'true' }), response({ 'access-control-allow-origin': '*' }))
  expect(result.findings.filter(item => item.rule.endsWith('wildcard-credentials'))).toHaveLength(2)
  expect(result.findings[0].detail).toContain('browsers block')
})
it('checks explicit authorization/method rules and Vary for matching credential origins', () => {
  const headers = { 'Access-Control-Allow-Origin': cors.origin, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'authorization', Vary: 'Accept-Encoding, Origin' }
  const result = reviewCors(cors, response(headers), response(headers, 200))
  expect(rules(result)).not.toEqual(expect.arrayContaining(['preflight-method', 'preflight-headers', 'preflight-vary']))
  expect(rules(result)).toContain('preflight-credentialed')
  expect(JSON.stringify(result)).not.toContain(cors.origin)
})
it('requires explicit authorization even with wildcard noncredentialed preflight headers', () => {
  const value = reviewCors({ ...cors, credentials: false }, response({ 'access-control-allow-origin': '*', 'access-control-allow-methods': '*', 'access-control-allow-headers': '*' }), response({}))
  expect(rules(value)).toContain('preflight-headers')
  expect(rules(value)).not.toContain('preflight-method')
})
it('does not require allow-methods for safelisted methods but checks DELETE and header requirements', () => {
  const headers = { 'access-control-allow-origin': cors.origin, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'authorization' }
  const result = reviewCors({ ...cors, method: 'GET' }, response(headers), response(headers))
  expect(rules(result)).not.toContain('preflight-method')
  expect(rules(result)).not.toContain('preflight-headers')
  expect(rules(reviewCors({ ...cors, method: 'DELETE' }, response(headers), response(headers)))).toContain('preflight-method')
})
const token = (header: unknown, payload: unknown, signature = 'c2ln'): string => [header, payload].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.') + '.' + signature
const policy = { algorithms: ['RS256'], issuer: 'expected-private', audience: 'private-audience', maxLifetimeSeconds: 3600 }
it('keeps signature verification explicitly false even when claims match', () => {
  const result = reviewJwt(token({ alg: 'RS256' }, { iss: policy.issuer, aud: [policy.audience], iat: 900, exp: 1100, sub: 'private-user' }), policy, 1000)
  expect(result.signatureVerified).toBe(false)
  expect(result.findings.filter(item => item.severity === 'warning')).toHaveLength(0)
  expect(JSON.stringify(result)).not.toContain('private')
})
it('flags unsigned, unexpected algorithm, expired claims and untrusted key sources without fetching', () => {
  const result = reviewJwt(token({ alg: 'none', jku: 'https://private-key.example' }, { iss: 'other', aud: 'other', exp: 900 }, ''), policy, 1000)
  expect(rules(result)).toEqual(expect.arrayContaining(['unsigned', 'algorithm', 'key-source', 'expired', 'issuer', 'audience']))
  expect(JSON.stringify(result)).not.toContain('private-key')
})
it('handles missing or nonfinite time claims, lifetime and future extensions', () => {
  expect(rules(reviewJwt(token({ alg: 'RS256', crit: ['b64'] }, { exp: 'private', nbf: 9000 }), policy, 1000))).toEqual(expect.arrayContaining(['expiry', 'issued-at', 'not-before', 'extensions']))
  expect(rules(reviewJwt(token({ alg: 'RS256' }, { exp: 9000, iat: 1100 }), policy, 1000))).toEqual(expect.arrayContaining(['lifetime', 'future-issued']))
})
it('rejects malformed token or policy with generic errors', () => {
  expect(() => reviewJwt('private-malformed', policy)).toThrow('Invalid compact JWT')
  expect(() => reviewJwt(token({}, {}), { ...policy, maxLifetimeSeconds: NaN })).toThrow('lifetime')
})
