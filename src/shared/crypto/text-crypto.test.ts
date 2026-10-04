import { createHash, createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { hashText, type TextHashAlgorithm } from './hash'
import { hmacHex, hmacBase64 } from './hmac'
import { aesGcmEncrypt, aesGcmDecrypt } from './aes'

describe('text cryptography', () => {
  it.each(['MD5', 'SHA-1', 'SHA-256', 'SHA-512'] as TextHashAlgorithm[])('%s matches independent digests including Unicode and block boundaries', async (algorithm) => {
    for (const text of ['', 'abc', 'Tiếng Việt 🔒', 'a'.repeat(55), 'a'.repeat(64), 'a'.repeat(1000)]) {
      const expected = createHash(algorithm.toLowerCase().replace('-', '')).update(text, 'utf8').digest('hex')
      expect(await hashText(text, algorithm)).toBe(expected)
    }
  })
  it('HMAC signs exact UTF-8 message/key with matching hex and Base64 encodings', async () => {
    const message = 'hello 🔒'
    const secret = 'khóa bí mật'
    for (const algorithm of ['SHA-256', 'SHA-512', 'SHA-1'] as const) {
      const expected = createHmac(algorithm.replace('-', '').toLowerCase(), secret).update(message).digest()
      expect(await hmacHex(message, secret, algorithm)).toBe(expected.toString('hex'))
      expect(await hmacBase64(message, secret, algorithm)).toBe(expected.toString('base64'))
    }
  })
  it('AES roundtrips Unicode, multiline and empty plaintext with fresh randomness', async () => {
    for (const plaintext of ['Xin chào 🔒\nsecond line', '']) {
      const first = await aesGcmEncrypt(plaintext, 'password')
      const second = await aesGcmEncrypt(plaintext, 'password')
      if (!first.ok || !second.ok) throw new Error('Encryption failed')
      expect(first.ciphertext).not.toBe(second.ciphertext)
      expect(await aesGcmDecrypt(first.ciphertext, 'password')).toEqual({ ok: true, plaintext })
      expect((await aesGcmDecrypt(first.ciphertext, 'wrong')).ok).toBe(false)
      const bytes = Buffer.from(first.ciphertext, 'base64')
      bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1
      expect((await aesGcmDecrypt(bytes.toString('base64'), 'password')).ok).toBe(false)
    }
  })
  it('AES rejects missing passwords and malformed ciphertext', async () => {
    expect((await aesGcmEncrypt('text', '')).ok).toBe(false)
    expect((await aesGcmDecrypt('%%%bad', 'password')).ok).toBe(false)
    expect((await aesGcmDecrypt('aGVsbG8=', 'password')).ok).toBe(false)
  })
})
