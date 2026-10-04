import { describe, expect, it } from 'vitest'
import { createHash, createPrivateKey, createPublicKey, diffieHellman, sign, verify } from 'crypto'
import type { KeygenRequest } from '@shared/crypto/keygen-types'
import { setImmediate as nextTurn } from 'node:timers/promises'
import { generateKeyPair } from './crypto-keys'

describe('generateKeyPair', () => {
  it('keeps the event loop responsive while generating RSA 4096', async () => {
    let settled = false
    const pending = generateKeyPair({ algorithm: 'rsa', modulusLength: 4096 }).then((result) => { settled = true; return result })
    await nextTurn()
    expect(settled).toBe(false)
    expect((await pending).label).toBe('RSA 4096')
  }, 30000)
  it('generates Ed25519 PEM + OpenSSH public', async () => {
    const r = await generateKeyPair({ algorithm: 'ed25519', comment: 'test@devutils' })
    expect(r.privateKeyPem).toContain('PRIVATE KEY')
    expect(r.publicKeyPem).toContain('PUBLIC KEY')
    expect(r.publicKeyOpenSsh).toMatch(/^ssh-ed25519\s+/)
    expect(r.publicKeyOpenSsh).toContain('test@devutils')
    expect(r.fingerprintSha256.startsWith('SHA256:')).toBe(true)
    createPublicKey(r.publicKeyPem)
  })

  it('generates RSA 2048', async () => {
    const r = await generateKeyPair({ algorithm: 'rsa', modulusLength: 2048 })
    expect(r.label).toContain('2048')
    expect(r.privateKeyPem.length).toBeGreaterThan(100)
    createPublicKey(r.publicKeyPem)
  })

  it('generates ECDSA P-256', async () => {
    const r = await generateKeyPair({ algorithm: 'ec-p256' })
    expect(r.label).toContain('P-256')
    createPublicKey(r.publicKeyPem)
  })

  it('X25519 has no OpenSSH public line', async () => {
    const r = await generateKeyPair({ algorithm: 'x25519' })
    expect(r.publicKeyOpenSsh).toBeNull()
    expect(r.publicKeyPem).toContain('PUBLIC KEY')
  })
  it.each(['ed25519', 'rsa', 'ec-p256', 'ec-p384', 'ec-p521'] as const)('produces matching %s private/public material and fingerprints', async (algorithm) => {
    const r = await generateKeyPair({ algorithm, comment: 'test@local' })
    expect(createPublicKey(r.privateKeyPem).export({ format: 'pem', type: 'spki' })).toBe(r.publicKeyPem)
    const message = Buffer.from('DevUtils key pair regression')
    const digest = algorithm === 'ed25519' ? null : 'sha256'
    expect(verify(digest, message, r.publicKeyPem, sign(digest, message, r.privateKeyPem))).toBe(true)
    const spki = createPublicKey(r.publicKeyPem).export({ type: 'spki', format: 'der' })
    expect(r.fingerprintHex).toBe(createHash('sha256').update(spki).digest('hex'))
    const wire = Buffer.from(r.publicKeyOpenSsh!.split(' ')[1]!, 'base64')
    expect(r.fingerprintOpenSshSha256).toBe(`SHA256:${createHash('sha256').update(wire).digest('base64').replace(/=+$/, '')}`)
    expect(r.fingerprintOpenSshSha256).not.toBe(r.fingerprintSha256)
  })
  it('X25519 pairs agree on a shared secret', async () => {
    const a = await generateKeyPair({ algorithm: 'x25519' })
    const b = await generateKeyPair({ algorithm: 'x25519' })
    expect(diffieHellman({ privateKey: createPrivateKey(a.privateKeyPem), publicKey: createPublicKey(b.publicKeyPem) }))
      .toEqual(diffieHellman({ privateKey: createPrivateKey(b.privateKeyPem), publicKey: createPublicKey(a.publicKeyPem) }))
    expect(a.fingerprintOpenSshSha256).toBeNull()
  })
  it('rejects unsupported sizes, algorithms and multiline comments instead of silently substituting', async () => {
    for (const req of [null, { algorithm: 'rsa', modulusLength: 1024 }, { algorithm: 'dsa' }, { algorithm: 'ed25519', comment: 'one\ntwo' }, { algorithm: 'ed25519', comment: 'x'.repeat(257) }]) {
      await expect(generateKeyPair(req as KeygenRequest)).rejects.toThrow()
    }
  })
})
