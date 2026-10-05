import { describe, expect, it } from 'vitest'
import { randomBytes } from 'crypto'
import {
  createKeyVerifiers,
  deriveLayerKeys,
  encryptBuffer,
  generateSalt,
  openDoc,
  parseEnvelope,
  sealDoc,
  serializeEnvelope,
  verifyKeyVerifiers
} from './crypto'

describe('secret-box dual-layer crypto', () => {
  it('derives different keys per layer', () => {
    const salt = generateSalt()
    const { keyA, keyB } = deriveLayerKeys('alpha', 'beta', salt)
    expect(keyA.equals(keyB)).toBe(false)
    const again = deriveLayerKeys('alpha', 'beta', salt)
    expect(keyA.equals(again.keyA)).toBe(true)
    expect(keyB.equals(again.keyB)).toBe(true)
  })

  it('roundtrips document with two keys', () => {
    const salt = generateSalt()
    const { keyA, keyB } = deriveLayerKeys('keyA-secret', 'keyB-secret', salt)
    const sealed = sealDoc(keyA, keyB, 'portable', {
      name: 'notes.md',
      type: 'markdown',
      encoding: 'utf-8',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      content: 'hello dual layer'
    })
    expect(sealed.v).toBe(2)
    const env = parseEnvelope(serializeEnvelope(sealed))
    const doc = openDoc(keyA, keyB, env)
    expect(doc.name).toBe('notes.md')
    expect(doc.content).toBe('hello dual layer')
  })

  it('wrong keys fail at decrypt', () => {
    const salt = generateSalt()
    const good = deriveLayerKeys('a', 'b', salt)
    const sealed = sealDoc(good.keyA, good.keyB, 'portable', {
      name: 'a.txt',
      type: 'text',
      encoding: 'utf-8',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      content: 'x'
    })
    const badB = deriveLayerKeys('a', 'wrong', salt)
    expect(() => openDoc(good.keyA, badB.keyB, sealed)).toThrow(/Cannot decrypt/)
    const badA = deriveLayerKeys('wrong', 'b', salt)
    expect(() => openDoc(badA.keyA, good.keyB, sealed)).toThrow(/Cannot decrypt/)
  })

  it('preserves legacy text and exact binary bytes through envelope validation', () => {
    const keyA = randomBytes(32), keyB = randomBytes(32)
    const base = { createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }
    const legacy = { ...base, name: 'legacy.txt', type: 'text' as const, content: 'legacy text without an encoding field' }
    const bytes = Buffer.from([0, 255, 128, 13, 10, 195, 40])
    const binary = { ...base, name: 'raw.bin', type: 'binary' as const, encoding: 'base64' as const, mimeType: 'application/octet-stream', content: bytes.toString('base64') }
    try {
      // Simulate the bytes written by legacy versions without weakening the new-write contract.
      const layer1 = encryptBuffer(keyA, Buffer.from(JSON.stringify(legacy), 'utf8'))
      const layer2 = encryptBuffer(keyB, Buffer.concat([layer1.iv, layer1.ct]))
      const template = sealDoc(keyA, keyB, 'portable', { ...legacy, encoding: 'utf-8' })
      const legacyEnvelope = { ...template, iv1: layer1.iv.toString('base64'), iv2: layer2.iv.toString('base64'), ct: layer2.ct.toString('base64') }
      expect(openDoc(keyA, keyB, parseEnvelope(serializeEnvelope(legacyEnvelope)))).toEqual(legacy)
      expect(openDoc(keyA, keyB, parseEnvelope(serializeEnvelope(sealDoc(keyA, keyB, 'portable', binary))))).toEqual(binary)
      expect(Buffer.from(openDoc(keyA, keyB, sealDoc(keyA, keyB, 'portable', binary)).content, 'base64')).toEqual(bytes)
    } finally { keyA.fill(0); keyB.fill(0) }
  })

  it('rejects malformed envelope fields before decrypting', () => {
    const keyA = randomBytes(32), keyB = randomBytes(32)
    try {
      const envelope = sealDoc(keyA, keyB, 'portable', {
        name: 'fixture.txt', type: 'text', encoding: 'utf-8', content: 'fixture', createdAt: '', updatedAt: ''
      })
      for (const fields of [{ iv2: 'AA==' }, { iv1: 'invalid' }, { salt: null }, { ct: '**==' }, { mode: 'unknown' }, { kdf: 'unknown' }]) {
        expect(() => parseEnvelope(JSON.stringify({ ...envelope, ...fields }))).toThrow('Invalid .putl file')
      }
    } finally { keyA.fill(0); keyB.fill(0) }
  })

  it('key verifiers accept good keys and reject bad', () => {
    const salt = generateSalt()
    const good = deriveLayerKeys('alpha', 'beta', salt)
    const auth = createKeyVerifiers(good.keyA, good.keyB)
    expect(auth.hashA).toBeTruthy()
    expect(auth.hashB).toBeTruthy()
    expect(Buffer.from(auth.hashA, 'base64').length).toBe(64)
    expect(Buffer.from(auth.hashB, 'base64').length).toBe(64)
    expect(verifyKeyVerifiers(good.keyA, good.keyB, auth)).toBe(true)
    const bad = deriveLayerKeys('alpha', 'nope', salt)
    expect(verifyKeyVerifiers(bad.keyA, bad.keyB, auth)).toBe(false)
  })
})

