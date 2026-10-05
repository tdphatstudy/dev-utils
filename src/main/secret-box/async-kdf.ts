import { scrypt, timingSafeEqual } from 'crypto'
import { KDF_DOMAIN_LAYER_A, KDF_DOMAIN_LAYER_B, KDF_DOMAIN_VERIFY_A, KDF_DOMAIN_VERIFY_B, VERIFY_HASH_LEN, VERIFY_SCRYPT_N, VERIFY_SCRYPT_R, VERIFY_SCRYPT_P, VERIFY_SCRYPT_MAXMEM } from '@shared/core/constants'
import { SCRYPT_PARAMS } from '@shared/secret-box/constants'
import type { VaultAuthConfig } from '@shared/secret-box/types'
import { normalizeKeyPart } from './crypto'

async function derive(material: Buffer, salt: Buffer, bytes: number, params: { N: number; r: number; p: number; maxmem?: number }): Promise<Buffer> {
  try { return await new Promise<Buffer>((resolve, reject) => scrypt(material, salt, bytes, params, (error, key) => error ? reject(error) : resolve(key))) }
  finally { material.fill(0) }
}
export async function deriveLayerKeysAsync(keyA: string, keyB: string, salt: Buffer): Promise<{ keyA: Buffer; keyB: Buffer }> {
  const first = await derive(Buffer.from(`${normalizeKeyPart(keyA)}\0${KDF_DOMAIN_LAYER_A}`, 'utf8'), salt, SCRYPT_PARAMS.keyLen, SCRYPT_PARAMS)
  try {
    const second = await derive(Buffer.from(`${normalizeKeyPart(keyB)}\0${KDF_DOMAIN_LAYER_B}`, 'utf8'), salt, SCRYPT_PARAMS.keyLen, SCRYPT_PARAMS)
    return { keyA: first, keyB: second }
  } catch (e) { first.fill(0); throw e }
}
export async function verifyKeyVerifiersAsync(keyA: Buffer, keyB: Buffer, auth: VaultAuthConfig): Promise<boolean> {
  if (auth.kdf !== 'scrypt' || auth.params.N !== VERIFY_SCRYPT_N || auth.params.r !== VERIFY_SCRYPT_R || auth.params.p !== VERIFY_SCRYPT_P || auth.params.keyLen !== VERIFY_HASH_LEN) return false
  const params = { N: VERIFY_SCRYPT_N, r: VERIFY_SCRYPT_R, p: VERIFY_SCRYPT_P, maxmem: VERIFY_SCRYPT_MAXMEM }
  for (const [key, domain, salt, expected] of [[keyA, KDF_DOMAIN_VERIFY_A, auth.saltA, auth.hashA], [keyB, KDF_DOMAIN_VERIFY_B, auth.saltB, auth.hashB]] as const) {
    const hash = Buffer.from(expected, 'base64')
    if (hash.length !== VERIFY_HASH_LEN) return false
    const actual = await derive(Buffer.concat([key, Buffer.from(`\0${domain}`, 'utf8')]), Buffer.from(salt, 'base64'), VERIFY_HASH_LEN, params)
    const matches = timingSafeEqual(hash, actual); actual.fill(0)
    if (!matches) return false
  }
  return true
}
