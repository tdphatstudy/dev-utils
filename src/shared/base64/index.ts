export type Base64Variant = 'standard' | 'url'

export function decodeBase64Bytes(input: string, variant: Base64Variant = 'standard'): { ok: true; bytes: Uint8Array } | { ok: false; error: string } {
  let b64 = input.replace(/\s+/g, '')
  const allowed = variant === 'url' ? /^[A-Za-z0-9_-]*={0,2}$/ : /^[A-Za-z0-9+/]*={0,2}$/
  if (!allowed.test(b64) || b64.replace(/=+$/, '').length % 4 === 1 || (b64.includes('=') && b64.length % 4 !== 0)) {
    return { ok: false, error: `Invalid ${variant === 'url' ? 'URL-safe ' : ''}Base64 alphabet or padding. Whitespace and unpadded input are accepted.` }
  }
  if (variant === 'url') b64 = b64.replace(/-/g, '+').replace(/_/g, '/')
  const bare = b64.replace(/=+$/, '')
  b64 = bare + '='.repeat((4 - bare.length % 4) % 4)
  try {
    const binary = atob(b64)
    if (btoa(binary).replace(/=+$/, '') !== bare) return { ok: false, error: 'Invalid Base64: non-zero padding bits. Check the final characters.' }
    return { ok: true, bytes: Uint8Array.from(binary, (char) => char.charCodeAt(0)) }
  } catch {
    return { ok: false, error: 'Invalid Base64 input' }
  }
}

export function encodeBase64(text: string, variant: Base64Variant = 'standard'): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  bytes.forEach((b) => {
    binary += String.fromCharCode(b)
  })
  const b64 = btoa(binary)
  if (variant === 'url') {
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  }
  return b64
}

export function decodeBase64(
  input: string,
  variant: Base64Variant = 'standard'
): { ok: true; text: string } | { ok: false; error: string } {
  try {
    const decoded = decodeBase64Bytes(input, variant)
    if (!decoded.ok) return decoded
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(decoded.bytes)
    return { ok: true, text }
  } catch {
    return { ok: false, error: 'Base64 decodes to binary bytes, not valid UTF-8 text. Select Hex bytes to inspect it.' }
  }
}
