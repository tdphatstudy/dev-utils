import { describe, expect, it } from 'vitest'
import {
  deriveLayerKeys,
  generateSalt,
  openDoc,
  parseEnvelope,
  sealDoc,
  serializeEnvelope
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

  it('wrong keys fail at decrypt (no stored verifier)', () => {
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
})
