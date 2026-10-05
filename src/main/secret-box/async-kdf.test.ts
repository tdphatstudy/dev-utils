import { expect, it } from 'vitest'
import { deriveLayerKeys, createKeyVerifiers } from './crypto'
import { deriveLayerKeysAsync, verifyKeyVerifiersAsync } from './async-kdf'
it('matches the existing normalized KDF and verifiers while yielding the event loop', async () => {
  const salt = Buffer.alloc(16, 3), keyA = 'Ａ', keyB = ' password with spaces '
  const expected = deriveLayerKeys(keyA, keyB, salt)
  let timerRan = false
  const timer = new Promise<void>((resolve) => setTimeout(() => { timerRan = true; resolve() }, 0))
  const actual = await deriveLayerKeysAsync(keyA, keyB, salt)
  expect(timerRan).toBe(true); await timer
  expect(actual).toEqual(expected)
  const auth = createKeyVerifiers(expected.keyA, expected.keyB)
  expect(await verifyKeyVerifiersAsync(actual.keyA, actual.keyB, auth)).toBe(true)
  expect(await verifyKeyVerifiersAsync(Buffer.alloc(32), actual.keyB, auth)).toBe(false)
}, 15_000)
