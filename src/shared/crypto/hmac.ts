export type HmacAlgorithm = 'SHA-256' | 'SHA-512' | 'SHA-1'

export async function hmacHex(
  message: string,
  secret: string,
  algorithm: HmacAlgorithm = 'SHA-256'
): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: algorithm },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function hmacBase64(
  message: string,
  secret: string,
  algorithm: HmacAlgorithm = 'SHA-256'
): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: algorithm },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  let binary = ''
  new Uint8Array(sig).forEach((b) => {
    binary += String.fromCharCode(b)
  })
  return btoa(binary)
}
