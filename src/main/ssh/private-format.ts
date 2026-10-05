import { createPrivateKey, randomBytes } from 'node:crypto'

function u32(value: number): Buffer {
  const bytes = Buffer.alloc(4)
  bytes.writeUInt32BE(value)
  return bytes
}
function string(value: Buffer | string): Buffer {
  const bytes = typeof value === 'string' ? Buffer.from(value, 'utf8') : value
  return Buffer.concat([u32(bytes.length), bytes])
}
function mpint(value: string): Buffer {
  let bytes = Buffer.from(value, 'base64url')
  while (bytes.length > 1 && bytes[0] === 0) bytes = bytes.subarray(1)
  if (bytes[0] & 0x80) bytes = Buffer.concat([Buffer.from([0]), bytes])
  return string(bytes)
}

/** Unencrypted OpenSSH v1 container, for SSH files only. Generic keygen stays PKCS#8. */
export function toOpenSshPrivateKey(pem: string, publicLine: string, comment: string): string {
  const jwk = createPrivateKey(pem).export({ format: 'jwk' })
  const check = randomBytes(4)
  let privateFields: Buffer[]
  if (jwk.kty === 'OKP' && jwk.crv === 'Ed25519' && jwk.x && jwk.d) {
    const x = Buffer.from(jwk.x, 'base64url'), seed = Buffer.from(jwk.d, 'base64url')
    if (x.length !== 32 || seed.length !== 32) throw new Error('Invalid Ed25519 private key material.')
    privateFields = [string('ssh-ed25519'), string(x), string(Buffer.concat([seed, x]))]
  } else if (jwk.kty === 'RSA' && jwk.n && jwk.e && jwk.d && jwk.qi && jwk.p && jwk.q) {
    privateFields = [string('ssh-rsa'), ...[jwk.n, jwk.e, jwk.d, jwk.qi, jwk.p, jwk.q].map(mpint)]
  } else throw new Error('SSH private format supports RSA and Ed25519 only.')
  const privateBlock = Buffer.concat([check, check, ...privateFields, string(comment)])
  const padding = Buffer.from(Array.from({ length: 8 - (privateBlock.length % 8) }, (_, i) => i + 1))
  const publicBlob = Buffer.from(publicLine.split(/\s+/)[1], 'base64')
  const container = Buffer.concat([Buffer.from('openssh-key-v1\0'), string('none'), string('none'), string(Buffer.alloc(0)), u32(1), string(publicBlob), string(Buffer.concat([privateBlock, padding]))])
  const base64 = container.toString('base64').match(/.{1,70}/g)!.join('\n')
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${base64}\n-----END OPENSSH PRIVATE KEY-----\n`
}
