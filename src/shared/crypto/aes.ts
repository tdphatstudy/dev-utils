// Packed ciphertext: base64(salt[16] | iv[12] | ciphertext+tag)
const PBKDF2_ITERATIONS = 100_000
const SALT_LEN = 16
const IV_LEN = 12

function bufToB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let binary = ''
  bytes.forEach((b) => {
    binary += String.fromCharCode(b)
  })
  return btoa(binary)
}

function b64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64.replace(/\s+/g, ''))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

function toBufferSource(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveKey'
  ])
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: toBufferSource(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function aesGcmEncrypt(
  plaintext: string,
  password: string
): Promise<{ ok: true; ciphertext: string } | { ok: false; error: string }> {
  try {
    if (!password) return { ok: false, error: 'Password required' }
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN))
    const iv = crypto.getRandomValues(new Uint8Array(IV_LEN))
    const key = await deriveKey(password, salt)
    const enc = new TextEncoder()
    const cipher = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: toBufferSource(iv) },
      key,
      enc.encode(plaintext)
    )
    const cipherBytes = new Uint8Array(cipher)
    const packed = new Uint8Array(SALT_LEN + IV_LEN + cipherBytes.length)
    packed.set(salt, 0)
    packed.set(iv, SALT_LEN)
    packed.set(cipherBytes, SALT_LEN + IV_LEN)
    return { ok: true, ciphertext: bufToB64(packed) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Encrypt failed' }
  }
}

export async function aesGcmDecrypt(
  ciphertextB64: string,
  password: string
): Promise<{ ok: true; plaintext: string } | { ok: false; error: string }> {
  try {
    if (!password) return { ok: false, error: 'Password required' }
    const packed = b64ToBytes(ciphertextB64)
    if (packed.length < SALT_LEN + IV_LEN + 16) {
      return { ok: false, error: 'Ciphertext too short' }
    }
    const salt = packed.slice(0, SALT_LEN)
    const iv = packed.slice(SALT_LEN, SALT_LEN + IV_LEN)
    const data = packed.slice(SALT_LEN + IV_LEN)
    const key = await deriveKey(password, salt)
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toBufferSource(iv) },
      key,
      toBufferSource(data)
    )
    return { ok: true, plaintext: new TextDecoder().decode(plain) }
  } catch {
    return { ok: false, error: 'Decrypt failed (wrong password or corrupt data)' }
  }
}
