function getRandomValues(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes)
    return bytes
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeCrypto = require('crypto') as typeof import('crypto')
  return nodeCrypto.randomBytes(length)
}

export function randomBytes(length: number): Uint8Array {
  if (!Number.isInteger(length) || length < 0 || length > 1_000_000) {
    throw new Error('Invalid length')
  }
  return getRandomValues(length)
}

export function randomHex(byteLength: number): string {
  return Array.from(randomBytes(byteLength), (b) => b.toString(16).padStart(2, '0')).join('')
}

export function randomBase64(byteLength: number): string {
  const bytes = randomBytes(byteLength)
  if (typeof btoa === 'function') {
    let binary = ''
    bytes.forEach((b) => {
      binary += String.fromCharCode(b)
    })
    return btoa(binary)
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeCrypto = require('crypto') as typeof import('crypto')
  return Buffer.from(bytes).toString('base64')
}

const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const DIGITS = '0123456789'
const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.<>?'

export interface PasswordOptions {
  length: number
  lower?: boolean
  upper?: boolean
  digits?: boolean
  symbols?: boolean
}

export function generatePassword(options: PasswordOptions): string {
  const { length, lower = true, upper = true, digits = true, symbols = false } = options
  if (length < 4 || length > 256) throw new Error('Password length must be 4–256')

  let alphabet = ''
  const required: string[] = []
  if (lower) {
    alphabet += LOWER
    required.push(pickChar(LOWER))
  }
  if (upper) {
    alphabet += UPPER
    required.push(pickChar(UPPER))
  }
  if (digits) {
    alphabet += DIGITS
    required.push(pickChar(DIGITS))
  }
  if (symbols) {
    alphabet += SYMBOLS
    required.push(pickChar(SYMBOLS))
  }
  if (!alphabet) throw new Error('Select at least one character set')

  const chars = [...required]
  while (chars.length < length) {
    chars.push(pickChar(alphabet))
  }
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

function pickChar(alphabet: string): string {
  return alphabet[randomInt(alphabet.length)]
}

export function randomInt(max: number): number {
  if (max <= 0 || max > 0xffffffff) throw new Error('Invalid max')
  const limit = Math.floor(0x100000000 / max) * max
  while (true) {
    const buf = randomBytes(4)
    const n = ((buf[0]! << 24) | (buf[1]! << 16) | (buf[2]! << 8) | buf[3]!) >>> 0
    if (n < limit) return n % max
  }
}

export function generateUuidV4(): string {
  const bytes = randomBytes(16)
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function estimatePasswordEntropy(length: number, alphabetSize: number): number {
  if (length <= 0 || alphabetSize <= 0) return 0
  return Math.log2(Math.pow(alphabetSize, length))
}
