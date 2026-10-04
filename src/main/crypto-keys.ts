import { createHash, generateKeyPair as nodeGenerateKeyPair, type KeyObject } from 'crypto'
import type { KeygenAlgorithm, KeygenRequest, KeygenResult } from '@shared/crypto/keygen-types'

function fingerprintFromPublic(publicKey: KeyObject): {
  fingerprintSha256: string
  fingerprintHex: string
} {
  const der = publicKey.export({ type: 'spki', format: 'der' }) as Buffer
  const hash = createHash('sha256').update(der).digest()
  return {
    fingerprintSha256: `SHA256:${hash.toString('base64').replace(/=+$/, '')}`,
    fingerprintHex: hash.toString('hex')
  }
}

function sshString(data: Buffer | string): Buffer {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data
  const len = Buffer.alloc(4)
  len.writeUInt32BE(buf.length, 0)
  return Buffer.concat([len, buf])
}

function sshMpint(beUnsigned: Buffer): Buffer {
  // Strip leading zeros; if high bit set, prepend 0x00
  let i = 0
  while (i < beUnsigned.length - 1 && beUnsigned[i] === 0) i++
  let v = beUnsigned.subarray(i)
  if (v.length > 0 && (v[0]! & 0x80) !== 0) {
    v = Buffer.concat([Buffer.from([0]), v])
  }
  return sshString(v)
}

/** Build OpenSSH one-line public key from JWK (Ed25519 / RSA). */
function tryOpenSshPublic(publicKey: KeyObject, comment: string): string | null {
  try {
    const jwk = publicKey.export({ format: 'jwk' }) as JsonWebKey
    let payload: Buffer | null = null
    let typeName = ''

    if (jwk.kty === 'OKP' && jwk.crv === 'Ed25519' && jwk.x) {
      typeName = 'ssh-ed25519'
      const x = Buffer.from(jwk.x, 'base64url')
      payload = Buffer.concat([sshString(typeName), sshString(x)])
    } else if (jwk.kty === 'RSA' && jwk.n && jwk.e) {
      typeName = 'ssh-rsa'
      const n = Buffer.from(jwk.n, 'base64url')
      const e = Buffer.from(jwk.e, 'base64url')
      payload = Buffer.concat([sshString(typeName), sshMpint(e), sshMpint(n)])
    } else if (jwk.kty === 'EC' && jwk.crv && jwk.x && jwk.y) {
      // ecdsa-sha2-nistp256 / 384 / 521
      const curveMap: Record<string, string> = {
        'P-256': 'nistp256',
        'P-384': 'nistp384',
        'P-521': 'nistp521'
      }
      const nist = curveMap[jwk.crv]
      if (!nist) return null
      typeName = `ecdsa-sha2-${nist}`
      const x = Buffer.from(jwk.x, 'base64url')
      const y = Buffer.from(jwk.y, 'base64url')
      // uncompressed point 0x04 || x || y
      const point = Buffer.concat([Buffer.from([0x04]), x, y])
      payload = Buffer.concat([
        sshString(typeName),
        sshString(nist),
        sshString(point)
      ])
    } else {
      return null
    }

    if (!payload) return null
    const b64 = payload.toString('base64')
    const c = comment.trim()
    return c ? `${typeName} ${b64} ${c}` : `${typeName} ${b64}`
  } catch {
    return null
  }
}

function labelFor(algorithm: KeygenAlgorithm, modulusLength?: number): string {
  switch (algorithm) {
    case 'rsa':
      return `RSA ${modulusLength ?? 2048}`
    case 'ec-p256':
      return 'ECDSA P-256'
    case 'ec-p384':
      return 'ECDSA P-384'
    case 'ec-p521':
      return 'ECDSA P-521'
    case 'ed25519':
      return 'Ed25519'
    case 'x25519':
      return 'X25519 (key agreement)'
  }
}

function asPemString(exported: string | Buffer): string {
  return typeof exported === 'string' ? exported : exported.toString('utf8')
}

export async function generateKeyPair(req: KeygenRequest): Promise<KeygenResult> {
  if (!req || typeof req !== 'object') throw new Error('Invalid key generation request.')
  if (req.comment !== undefined && (typeof req.comment !== 'string' || req.comment.length > 256 || /[\r\n\0]/.test(req.comment))) {
    throw new Error('OpenSSH comment must be a single line of at most 256 characters.')
  }
  const algorithm = req.algorithm
  const comment = req.comment?.trim() || ''
  const modulusLength = req.modulusLength ?? 2048
  if (algorithm === 'rsa' && ![2048, 3072, 4096].includes(modulusLength)) throw new Error('RSA size must be 2048, 3072 or 4096 bits.')
  const { publicKey, privateKey } = await new Promise<{ publicKey: KeyObject; privateKey: KeyObject }>((resolve, reject) => {
    const done = (error: Error | null, publicKey: KeyObject, privateKey: KeyObject): void => {
      if (error) reject(error)
      else resolve({ publicKey, privateKey })
    }
    switch (algorithm) {
      case 'rsa': nodeGenerateKeyPair('rsa', { modulusLength, publicExponent: 0x10001 }, done); break
      case 'ec-p256': case 'ec-p384': case 'ec-p521':
        nodeGenerateKeyPair('ec', { namedCurve: algorithm === 'ec-p256' ? 'P-256' : algorithm === 'ec-p384' ? 'P-384' : 'P-521' }, done); break
      case 'ed25519': nodeGenerateKeyPair('ed25519', {}, done); break
      case 'x25519': nodeGenerateKeyPair('x25519', {}, done); break
      default: reject(new Error('Unsupported key algorithm.'))
    }
  })

  const privateKeyPem = asPemString(
    privateKey.export({ type: 'pkcs8', format: 'pem' })
  )
  const publicKeyPem = asPemString(publicKey.export({ type: 'spki', format: 'pem' }))
  const fp = fingerprintFromPublic(publicKey)
  const publicKeyOpenSsh =
    algorithm === 'x25519' ? null : tryOpenSshPublic(publicKey, comment)

  return {
    algorithm,
    privateKeyPem,
    publicKeyPem,
    publicKeyOpenSsh,
    fingerprintOpenSshSha256: publicKeyOpenSsh ? `SHA256:${createHash('sha256').update(Buffer.from(publicKeyOpenSsh.split(' ')[1]!, 'base64')).digest('base64').replace(/=+$/, '')}` : null,
    fingerprintSha256: fp.fingerprintSha256,
    fingerprintHex: fp.fingerprintHex,
    label: labelFor(algorithm, modulusLength)
  }
}
