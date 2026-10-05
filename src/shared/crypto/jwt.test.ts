import { describe, expect, it } from 'vitest'
import { generateKeyPairSync, sign } from 'node:crypto'
import {
  JWT_SAMPLE_SECRET,
  createSampleJwt,
  decodeJwt,
  signJwt,
  verifyJwt
} from './jwt'

describe('jwt', () => {
  it('signs and verifies HS256', async () => {
    const signed = await signJwt({
      secret: 'test-secret-key',
      payload: { sub: 'u1', role: 'admin', iat: 1_700_000_000 }
    })
    expect(signed.ok).toBe(true)
    if (!signed.ok) return

    const decoded = decodeJwt(signed.token)
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    expect(decoded.payload.sub).toBe('u1')
    expect(decoded.algorithm).toBe('HS256')

    const good = await verifyJwt(signed.token, 'test-secret-key')
    expect(good.ok && good.valid).toBe(true)

    const bad = await verifyJwt(signed.token, 'wrong-secret')
    expect(bad.ok && bad.valid).toBe(false)
  })

  it('sample token verifies with sample secret', async () => {
    const token = await createSampleJwt()
    const v = await verifyJwt(token, JWT_SAMPLE_SECRET)
    expect(v.ok && v.valid).toBe(true)
  })

  it('strips Bearer prefix', () => {
    const d = decodeJwt(
      'Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.'
    )
    // none alg still decodes structure if base64 valid — may fail on empty sig
    // just ensure Bearer strip works on valid 3-part
    expect(d).toMatchObject({ ok: true, algorithm: 'none', payload: { sub: 'x' } })
  })

  it('reports expired', async () => {
    const signed = await signJwt({
      secret: 's',
      payload: { exp: 1_000_000_000 }
    })
    expect(signed.ok).toBe(true)
    if (!signed.ok) return
    const d = decodeJwt(signed.token)
    expect(d.ok && d.expired).toBe(true)
  })
})

const encode = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url')
it('identifies malformed token segments and rejects non-object JSON and noncanonical encoding', () => {
  for (const value of [null, [], 'text', 1]) {
    expect(decodeJwt(`${encode(value)}.${encode({})}.`)).toMatchObject({ ok: false, error: expect.stringContaining('Header') })
    expect(decodeJwt(`${encode({})}.${encode(value)}.`)).toMatchObject({ ok: false, error: expect.stringContaining('Payload') })
  }
  expect(decodeJwt(`${encode({})}.${encode({})}.AB`)).toMatchObject({ ok: false, error: expect.stringContaining('Signature') })
  expect(decodeJwt(`${encode({})}.${Buffer.from([0xff]).toString('base64url')}.`)).toMatchObject({ ok: false, error: expect.stringContaining('Payload') })
})
it('preserves exact secret whitespace across every HMAC algorithm', async () => {
  for (const algorithm of ['HS256', 'HS384', 'HS512'] as const) {
    const signed = await signJwt({ payload: { sub: 'test' }, secret: ' secret\n', algorithm })
    if (!signed.ok) throw new Error(signed.error)
    expect(await verifyJwt(signed.token, ' secret\n')).toMatchObject({ ok: true, valid: true })
    expect(await verifyJwt(signed.token, 'secret')).toMatchObject({ ok: true, valid: false })
  }
})
it('keeps huge or incorrectly typed claim dates decodable with useful warnings', () => {
  const decoded = decodeJwt(`${encode({ alg: 'none' })}.${encode({ exp: 1e100, nbf: 'tomorrow', iat: null })}.`)
  expect(decoded.ok).toBe(true)
  if (decoded.ok) { expect(decoded.claimWarnings).toHaveLength(3); expect(decoded.expiresAt).toBeUndefined() }
})
it('rejects algorithm overrides and unsupported critical headers', async () => {
  const signed = await signJwt({ payload: {}, secret: 'test' })
  if (!signed.ok) throw new Error(signed.error)
  expect(await verifyJwt(signed.token, 'test', { algorithm: 'HS512' })).toMatchObject({ ok: false, error: expect.stringContaining('does not match') })
  const token = `${encode({ alg: 'HS256', crit: ['custom'], custom: true })}.${encode({})}.`
  expect(await verifyJwt(token, 'test')).toMatchObject({ ok: false, error: expect.stringContaining('Critical') })
  expect(await signJwt({ payload: {}, secret: 'test', headerExtra: { alg: 'none' } })).toMatchObject({ ok: false })
  expect(await signJwt({ payload: [] as unknown as Record<string, unknown>, secret: 'test' })).toMatchObject({ ok: false })
})
it('verifies independently signed RSA and ECDSA tokens and rejects modified signatures', async () => {
  for (const algorithm of ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512']) {
    const rsa = algorithm.startsWith('RS')
    const curve = { ES256: 'prime256v1', ES384: 'secp384r1', ES512: 'secp521r1' }[algorithm]
    const pair = rsa ? generateKeyPairSync('rsa', { modulusLength: 2048 }) : generateKeyPairSync('ec', { namedCurve: curve! })
    const input = `${encode({ alg: algorithm })}.${encode({ sub: 'independent' })}`
    const hash = { '256': 'sha256', '384': 'sha384', '512': 'sha512' }[algorithm.slice(2)]!
    const signature = sign(hash, Buffer.from(input), { key: pair.privateKey, dsaEncoding: 'ieee-p1363' })
    const pem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
    expect(await verifyJwt(`${input}.${signature.toString('base64url')}`, pem)).toMatchObject({ ok: true, valid: true })
    signature[0] = signature[0]! ^ 1
    expect(await verifyJwt(`${input}.${signature.toString('base64url')}`, pem)).toMatchObject({ ok: true, valid: false })
  }
})
