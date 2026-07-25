export type Base64Variant = 'standard' | 'url'

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
    let b64 = input.trim().replace(/\s+/g, '')
    if (variant === 'url') {
      b64 = b64.replace(/-/g, '+').replace(/_/g, '/')
      const pad = b64.length % 4
      if (pad) b64 += '='.repeat(4 - pad)
    }
    const binary = atob(b64)
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
    const text = new TextDecoder().decode(bytes)
    return { ok: true, text }
  } catch {
    return { ok: false, error: 'Invalid Base64 input' }
  }
}
