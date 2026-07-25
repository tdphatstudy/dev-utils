export type JwtDecodeResult =
  | {
      ok: true
      header: unknown
      payload: unknown
      signature: string
      headerRaw: string
      payloadRaw: string
      algorithm?: string
      expiresAt?: string
      issuedAt?: string
      expired?: boolean
    }
  | {
      ok: false
      error: string
    }

function b64UrlToBytes(input: string): Uint8Array {
  let b64 = input.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4
  if (pad) b64 += '='.repeat(4 - pad)
  const binary = atob(b64)
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

function b64UrlToJson(part: string): unknown {
  const bytes = b64UrlToBytes(part)
  const text = new TextDecoder().decode(bytes)
  return JSON.parse(text)
}

export function decodeJwt(token: string): JwtDecodeResult {
  const raw = token.trim()
  if (!raw) return { ok: false, error: 'Empty token' }

  const parts = raw.split('.')
  if (parts.length !== 3) {
    return { ok: false, error: 'JWT must have 3 parts (header.payload.signature)' }
  }

  try {
    const [headerRaw, payloadRaw, signature] = parts as [string, string, string]
    const header = b64UrlToJson(headerRaw) as Record<string, unknown>
    const payload = b64UrlToJson(payloadRaw) as Record<string, unknown>

    let expiresAt: string | undefined
    let issuedAt: string | undefined
    let expired: boolean | undefined

    if (typeof payload.exp === 'number') {
      expiresAt = new Date(payload.exp * 1000).toISOString()
      expired = Date.now() >= payload.exp * 1000
    }
    if (typeof payload.iat === 'number') {
      issuedAt = new Date(payload.iat * 1000).toISOString()
    }

    return {
      ok: true,
      header,
      payload,
      signature,
      headerRaw,
      payloadRaw,
      algorithm: typeof header.alg === 'string' ? header.alg : undefined,
      expiresAt,
      issuedAt,
      expired
    }
  } catch {
    return { ok: false, error: 'Failed to decode JWT (invalid base64/json)' }
  }
}
