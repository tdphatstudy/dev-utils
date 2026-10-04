import { describe, expect, it } from 'vitest'
import { createPublicKey } from 'crypto'
import { generateKeyPair } from './crypto-keys'

describe('generateKeyPair', () => {
  it('generates Ed25519 PEM + OpenSSH public', () => {
    const r = generateKeyPair({ algorithm: 'ed25519', comment: 'test@devutils' })
    expect(r.privateKeyPem).toContain('PRIVATE KEY')
    expect(r.publicKeyPem).toContain('PUBLIC KEY')
    expect(r.publicKeyOpenSsh).toMatch(/^ssh-ed25519\s+/)
    expect(r.publicKeyOpenSsh).toContain('test@devutils')
    expect(r.fingerprintSha256.startsWith('SHA256:')).toBe(true)
    createPublicKey(r.publicKeyPem)
  })

  it('generates RSA 2048', () => {
    const r = generateKeyPair({ algorithm: 'rsa', modulusLength: 2048 })
    expect(r.label).toContain('2048')
    expect(r.privateKeyPem.length).toBeGreaterThan(100)
    createPublicKey(r.publicKeyPem)
  })

  it('generates ECDSA P-256', () => {
    const r = generateKeyPair({ algorithm: 'ec-p256' })
    expect(r.label).toContain('P-256')
    createPublicKey(r.publicKeyPem)
  })

  it('X25519 has no OpenSSH public line', () => {
    const r = generateKeyPair({ algorithm: 'x25519' })
    expect(r.publicKeyOpenSsh).toBeNull()
    expect(r.publicKeyPem).toContain('PUBLIC KEY')
  })
})
