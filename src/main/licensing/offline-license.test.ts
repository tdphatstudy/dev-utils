import { generateKeyPairSync, sign } from 'node:crypto'
import { expect, it } from 'vitest'
import { LICENSE_DOMAIN, verifyOfflineLicense } from './offline-license.mjs'

const issuer = generateKeyPairSync('ed25519')
const other = generateKeyPairSync('ed25519')
const trusted = { 'issuer-1': issuer.publicKey.export({ type: 'spki', format: 'pem' }).toString() }
const now = 1791504000
const claims = { version: 1, product: 'com.devutils.app', id: 'fixture-license', edition: 'pro', features: ['clipboard', 'ocr'], issuedAt: now }
function license(value: unknown = claims, key = issuer.privateKey, domain = LICENSE_DOMAIN): string {
  const payload = Buffer.from(JSON.stringify(value))
  return JSON.stringify({ version: 1, keyId: 'issuer-1', payload: payload.toString('base64url'), signature: sign(null, Buffer.concat([domain, payload]), key).toString('base64url') })
}

it('verifies perpetual and expiring offline licenses with only a trusted public key', () => {
  const valid = verifyOfflineLicense(license(), trusted, now)
  expect(valid.features).toEqual(['clipboard', 'ocr'])
  expect(Object.isFrozen(valid)).toBe(true)
  expect(Object.isFrozen(valid.features)).toBe(true)
  expect(verifyOfflineLicense(license({ ...claims, notBefore: now, expiresAt: now + 10 }), trusted, now).edition).toBe('pro')
})

it('rejects modified entitlements, unrelated signatures and replacement issuers', () => {
  const changed = JSON.parse(license())
  changed.payload = Buffer.from(JSON.stringify({ ...claims, features: ['all'] })).toString('base64url')
  expect(() => verifyOfflineLicense(JSON.stringify(changed), trusted, now)).toThrow(/signature/)
  expect(() => verifyOfflineLicense(license(claims, other.privateKey), trusted, now)).toThrow(/signature/)
  expect(() => verifyOfflineLicense(license(claims, issuer.privateKey, Buffer.alloc(0)), trusted, now)).toThrow(/signature/)
  expect(() => verifyOfflineLicense(license(), {}, now)).toThrow(/issuer/)
  expect(() => verifyOfflineLicense(license(), { 'issuer-1': issuer.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() }, now)).toThrow(/signature/)
  const suppliedKey = { ...changed, publicKey: other.publicKey.export({ type: 'spki', format: 'pem' }).toString() }
  expect(() => verifyOfflineLicense(JSON.stringify(suppliedKey), trusted, now)).toThrow(/issuer/)
})

it('rejects expired, premature, foreign-product and unsupported claims', () => {
  for (const change of [{ expiresAt: now + 1 }, { issuedAt: now + 500 }, { notBefore: now + 5 }, { product: 'different.app' }, { version: 2 }, { features: ['ocr', 'ocr'] }, { features: ['ocr', 3] }, { unexpected: 'claim' }, { expiresAt: 'never' }]) {
    expect(() => verifyOfflineLicense(license({ ...claims, ...change }), trusted, now + 1)).toThrow()
  }
})

it('bounds parsing and rejects malformed, non-canonical or short signature encodings', () => {
  for (const text of ['{', ' '.repeat(16385), JSON.stringify({ ...JSON.parse(license()), signature: 'AA' }), JSON.stringify({ ...JSON.parse(license()), payload: JSON.parse(license()).payload + '=' }), JSON.stringify({ ...JSON.parse(license()), keyId: '__proto__' })]) {
    expect(() => verifyOfflineLicense(text, trusted, now)).toThrow()
  }
  const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'pem' }).toString()
  expect(() => verifyOfflineLicense(license(), { 'issuer-1': rsa }, now)).toThrow(/signature/)
  expect(() => verifyOfflineLicense(license(), trusted, NaN)).toThrow()
})
