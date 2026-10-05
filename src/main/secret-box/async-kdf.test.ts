import { expect, it } from 'vitest'
import { createKeyVerifiersAsync, deriveLayerKeysAsync, verifyKeyVerifiersAsync } from './async-kdf'
import { deriveLayerKeys, verifyKeyVerifiers, createKeyVerifiers } from './crypto'

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

it('keeps existing key/verifier formats while letting timers run during derivation', async () => {
  const salt = Buffer.alloc(16, 7), reference = deriveLayerKeys('fixture A', 'fixture B', salt)
  let ticks = 0
  const timer = setInterval(() => { ticks++ }, 5)
  const keys = await deriveLayerKeysAsync('fixture A', 'fixture B', salt)
  try {
    const auth = await createKeyVerifiersAsync(keys.keyA, keys.keyB)
    expect(ticks).toBeGreaterThan(1)
    expect(keys.keyA).toEqual(reference.keyA); expect(keys.keyB).toEqual(reference.keyB)
    expect(verifyKeyVerifiers(reference.keyA, reference.keyB, auth)).toBe(true)
    expect(await verifyKeyVerifiersAsync(keys.keyA, keys.keyB, auth)).toBe(true)
    expect(await verifyKeyVerifiersAsync(Buffer.alloc(32), keys.keyB, auth)).toBe(false)
  } finally {
    clearInterval(timer)
    for (const pair of [keys, reference]) { pair.keyA.fill(0); pair.keyB.fill(0) }
  }
}, 15000)
