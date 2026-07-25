/**
 * JWT decode + verify (HS / RS / ES) + sign (HS) via Web Crypto.
 * Secrets never leave the local process.
 */

export type JwtDecodeResult =
  | {
      ok: true
      header: Record<string, unknown>
      payload: Record<string, unknown>
      signature: string
      headerRaw: string
      payloadRaw: string
      algorithm?: string
      expiresAt?: string
      issuedAt?: string
      notBefore?: string
      expired?: boolean
      notYetValid?: boolean
    }
  | {
      ok: false
      error: string
    }

export type JwtVerifyResult =
  | {
      ok: true
      valid: boolean
      algorithm: string
      reason?: string
      decode: Extract<JwtDecodeResult, { ok: true }>
    }
  | {
      ok: false
      error: string
      decode?: Extract<JwtDecodeResult, { ok: true }>
    }

export type JwtSignResult =
  | { ok: true; token: string }
  | { ok: false; error: string }

export type HsAlgorithm = 'HS256' | 'HS384' | 'HS512'
export type RsAlgorithm = 'RS256' | 'RS384' | 'RS512'
export type EsAlgorithm = 'ES256' | 'ES384' | 'ES512'
export type JwtSignAlgorithm = HsAlgorithm

const HS_HASH: Record<HsAlgorithm, string> = {
  HS256: 'SHA-256',
  HS384: 'SHA-384',
  HS512: 'SHA-512'
}

const RS_HASH: Record<RsAlgorithm, string> = {
  RS256: 'SHA-256',
  RS384: 'SHA-384',
  RS512: 'SHA-512'
}

const ES_PARAMS: Record<
  EsAlgorithm,
  { namedCurve: string; hash: string; sigLen: number }
> = {
  ES256: { namedCurve: 'P-256', hash: 'SHA-256', sigLen: 64 },
  ES384: { namedCurve: 'P-384', hash: 'SHA-384', sigLen: 96 },
  ES512: { namedCurve: 'P-521', hash: 'SHA-512', sigLen: 132 }
}

function b64UrlToBytes(input: string): Uint8Array {
  let b64 = input.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4
  if (pad) b64 += '='.repeat(4 - pad)
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

function bytesToB64Url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]!)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64UrlToJson(part: string): unknown {
  const bytes = b64UrlToBytes(part)
  const text = new TextDecoder().decode(bytes)
  return JSON.parse(text)
}

function jsonToB64Url(value: unknown): string {
  const text = JSON.stringify(value)
  return bytesToB64Url(new TextEncoder().encode(text))
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}

function claimTimes(payload: Record<string, unknown>): {
  expiresAt?: string
  issuedAt?: string
  notBefore?: string
  expired?: boolean
  notYetValid?: boolean
} {
  let expiresAt: string | undefined
  let issuedAt: string | undefined
  let notBefore: string | undefined
  let expired: boolean | undefined
  let notYetValid: boolean | undefined
  const now = Date.now()

  if (typeof payload.exp === 'number') {
    expiresAt = new Date(payload.exp * 1000).toISOString()
    expired = now >= payload.exp * 1000
  }
  if (typeof payload.iat === 'number') {
    issuedAt = new Date(payload.iat * 1000).toISOString()
  }
  if (typeof payload.nbf === 'number') {
    notBefore = new Date(payload.nbf * 1000).toISOString()
    notYetValid = now < payload.nbf * 1000
  }
  return { expiresAt, issuedAt, notBefore, expired, notYetValid }
}

export function decodeJwt(token: string): JwtDecodeResult {
  const raw = token.trim()
  if (!raw) return { ok: false, error: 'Empty token' }

  // strip Bearer prefix
  const cleaned = raw.replace(/^Bearer\s+/i, '')
  const parts = cleaned.split('.')
  if (parts.length !== 3) {
    return { ok: false, error: 'JWT must have 3 parts (header.payload.signature)' }
  }

  try {
    const [headerRaw, payloadRaw, signature] = parts as [string, string, string]
    const header = b64UrlToJson(headerRaw) as Record<string, unknown>
    const payload = b64UrlToJson(payloadRaw) as Record<string, unknown>
    const times = claimTimes(payload)

    return {
      ok: true,
      header,
      payload,
      signature,
      headerRaw,
      payloadRaw,
      algorithm: typeof header.alg === 'string' ? header.alg : undefined,
      ...times
    }
  } catch {
    return { ok: false, error: 'Failed to decode JWT (invalid base64/json)' }
  }
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const cleaned = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '')
  const binary = atob(cleaned)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

async function verifyHs(
  signingInput: string,
  signatureB64Url: string,
  secret: string,
  alg: HsAlgorithm
): Promise<boolean> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: HS_HASH[alg] },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(signingInput))
  const expected = new Uint8Array(sig)
  const actual = b64UrlToBytes(signatureB64Url)
  return timingSafeEqual(expected, actual)
}

// RSA-PKCS1-v1_5 signature verify (SPKI public key PEM).
async function verifyRs(
  signingInput: string,
  signatureB64Url: string,
  publicKeyPem: string,
  alg: RsAlgorithm
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'spki',
    pemToArrayBuffer(publicKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: RS_HASH[alg] },
    false,
    ['verify']
  )
  const sig = b64UrlToBytes(signatureB64Url)
  return crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    sig.buffer.slice(sig.byteOffset, sig.byteOffset + sig.byteLength) as ArrayBuffer,
    new TextEncoder().encode(signingInput)
  )
}

async function verifyEs(
  signingInput: string,
  signatureB64Url: string,
  publicKeyPem: string,
  alg: EsAlgorithm
): Promise<boolean> {
  const params = ES_PARAMS[alg]
  const key = await crypto.subtle.importKey(
    'spki',
    pemToArrayBuffer(publicKeyPem),
    { name: 'ECDSA', namedCurve: params.namedCurve },
    false,
    ['verify']
  )
  // JWT ECDSA signatures are raw r||s (P1363), which Web Crypto accepts for ECDSA
  const sig = b64UrlToBytes(signatureB64Url)
  return crypto.subtle.verify(
    { name: 'ECDSA', hash: params.hash },
    key,
    sig.buffer.slice(sig.byteOffset, sig.byteOffset + sig.byteLength) as ArrayBuffer,
    new TextEncoder().encode(signingInput)
  )
}

/**
 * Verify JWT signature.
 * - HS: pass shared `secret`
 * - RS / ES: pass PEM public key in `secret` (or publicKey field)
 */
export async function verifyJwt(
  token: string,
  secretOrKey: string,
  options?: { algorithm?: string }
): Promise<JwtVerifyResult> {
  const decoded = decodeJwt(token)
  if (!decoded.ok) return { ok: false, error: decoded.error }

  const alg = (options?.algorithm || decoded.algorithm || '').toUpperCase()
  if (!alg || alg === 'NONE') {
    return {
      ok: true,
      valid: false,
      algorithm: alg || 'none',
      reason: 'Algorithm is missing or "none" — cannot verify',
      decode: decoded
    }
  }

  const key = secretOrKey.trim()
  if (!key) {
    return {
      ok: true,
      valid: false,
      algorithm: alg,
      reason: 'Enter a secret (HS) or public key PEM (RS or ES)',
      decode: decoded
    }
  }

  const signingInput = `${decoded.headerRaw}.${decoded.payloadRaw}`

  try {
    let valid = false
    if (alg === 'HS256' || alg === 'HS384' || alg === 'HS512') {
      valid = await verifyHs(signingInput, decoded.signature, key, alg)
    } else if (alg === 'RS256' || alg === 'RS384' || alg === 'RS512') {
      if (!key.includes('BEGIN')) {
        return {
          ok: true,
          valid: false,
          algorithm: alg,
          reason: 'RS algorithms require a PEM public key (BEGIN PUBLIC KEY)',
          decode: decoded
        }
      }
      valid = await verifyRs(signingInput, decoded.signature, key, alg)
    } else if (alg === 'ES256' || alg === 'ES384' || alg === 'ES512') {
      if (!key.includes('BEGIN')) {
        return {
          ok: true,
          valid: false,
          algorithm: alg,
          reason: 'ES algorithms require a PEM public key (BEGIN PUBLIC KEY)',
          decode: decoded
        }
      }
      valid = await verifyEs(signingInput, decoded.signature, key, alg)
    } else {
      return {
        ok: true,
        valid: false,
        algorithm: alg,
        reason: `Unsupported algorithm "${alg}" (supported: HS256/384/512, RS256/384/512, ES256/384/512)`,
        decode: decoded
      }
    }

    return {
      ok: true,
      valid,
      algorithm: alg,
      reason: valid ? undefined : 'Signature does not match secret/key',
      decode: decoded
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Verification failed',
      decode: decoded
    }
  }
}

export async function signJwt(options: {
  payload: Record<string, unknown>
  secret: string
  algorithm?: HsAlgorithm
  headerExtra?: Record<string, unknown>
}): Promise<JwtSignResult> {
  const secret = options.secret
  if (!secret) return { ok: false, error: 'Secret is required to sign' }

  const alg: HsAlgorithm = options.algorithm ?? 'HS256'
  const header = {
    alg,
    typ: 'JWT',
    ...options.headerExtra
  }

  try {
    const headerRaw = jsonToB64Url(header)
    const payloadRaw = jsonToB64Url(options.payload)
    const signingInput = `${headerRaw}.${payloadRaw}`
    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: HS_HASH[alg] },
      false,
      ['sign']
    )
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(signingInput))
    const token = `${signingInput}.${bytesToB64Url(sig)}`
    return { ok: true, token }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Sign failed' }
  }
}

/** Classic jwt.io-compatible sample (secret: "a-string-secret-at-least-256-bits-long") */
export const JWT_SAMPLE_SECRET = 'a-string-secret-at-least-256-bits-long'

export async function createSampleJwt(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const signed = await signJwt({
    secret: JWT_SAMPLE_SECRET,
    algorithm: 'HS256',
    payload: {
      sub: '1234567890',
      name: 'DevUtils',
      iat: now,
      exp: now + 60 * 60 * 24 * 365
    }
  })
  if (!signed.ok) {
    // fallback static (may not verify with sample secret if outdated)
    return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkRldlV0aWxzIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
  }
  return signed.token
}
