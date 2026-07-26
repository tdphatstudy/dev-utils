import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual
} from 'crypto'
import {
  AES_GCM_IV_BYTES,
  AES_GCM_TAG_BYTES,
  DEVICE_SECRET_BYTES,
  KDF_DOMAIN_LAYER_A,
  KDF_DOMAIN_LAYER_B,
  KDF_DOMAIN_VERIFY_A,
  KDF_DOMAIN_VERIFY_B,
  PUTL_ENVELOPE_VERSION,
  SALT_BYTES,
  VERIFY_HASH_LEN,
  VERIFY_SCRYPT_MAXMEM,
  VERIFY_SCRYPT_N,
  VERIFY_SCRYPT_P,
  VERIFY_SCRYPT_R
} from '@shared/core/constants'
import { SCRYPT_PARAMS } from '@shared/secret-box/constants'
import type {
  DocPayload,
  PutlEnvelope,
  VaultAuthConfig,
  VaultMode
} from '@shared/secret-box/types'

export function normalizeKeyPart(s: string): string {
  return s.normalize('NFKC')
}

export function generateSalt(): Buffer {
  return randomBytes(SALT_BYTES)
}

function scryptKey(secret: string, salt: Buffer, domain: string): Buffer {
  const material = Buffer.from(`${normalizeKeyPart(secret)}\0${domain}`, 'utf8')
  return scryptSync(material, salt, SCRYPT_PARAMS.keyLen, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p
  })
}

export function deriveLayerKeys(
  keyA: string,
  keyB: string,
  vaultSalt: Buffer
): { keyA: Buffer; keyB: Buffer } {
  return {
    keyA: scryptKey(keyA, vaultSalt, KDF_DOMAIN_LAYER_A),
    keyB: scryptKey(keyB, vaultSalt, KDF_DOMAIN_LAYER_B)
  }
}

export function encryptBuffer(key: Buffer, plaintext: Buffer): { iv: Buffer; ct: Buffer } {
  const iv = randomBytes(AES_GCM_IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return { iv, ct: Buffer.concat([enc, tag]) }
}

export function decryptBuffer(key: Buffer, iv: Buffer, ctWithTag: Buffer): Buffer {
  if (ctWithTag.length < AES_GCM_TAG_BYTES) throw new Error('Ciphertext too short')
  const data = ctWithTag.subarray(0, ctWithTag.length - AES_GCM_TAG_BYTES)
  const tag = ctWithTag.subarray(ctWithTag.length - AES_GCM_TAG_BYTES)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()])
}

export function sealDoc(
  keyA: Buffer,
  keyB: Buffer,
  mode: VaultMode,
  payload: DocPayload
): PutlEnvelope {
  // `salt` on the envelope is reserved/unused for key derivation (keys come from vault salt).
  // Kept for envelope shape compatibility with existing .putl files.
  const fileSalt = generateSalt()
  const plain = Buffer.from(JSON.stringify(payload), 'utf8')
  const layer1 = encryptBuffer(keyA, plain)
  const packed1 = Buffer.concat([layer1.iv, layer1.ct])
  const layer2 = encryptBuffer(keyB, packed1)
  return {
    v: PUTL_ENVELOPE_VERSION,
    mode,
    kdf: 'scrypt',
    salt: fileSalt.toString('base64'),
    iv1: layer1.iv.toString('base64'),
    iv2: layer2.iv.toString('base64'),
    ct: layer2.ct.toString('base64')
  }
}

export function openDoc(keyA: Buffer, keyB: Buffer, envelope: PutlEnvelope): DocPayload {
  if (envelope.v !== PUTL_ENVELOPE_VERSION) {
    throw new Error('Unsupported .putl version')
  }
  try {
    const iv2 = Buffer.from(envelope.iv2, 'base64')
    const ct2 = Buffer.from(envelope.ct, 'base64')
    const packed1 = decryptBuffer(keyB, iv2, ct2)
    if (packed1.length < AES_GCM_IV_BYTES + AES_GCM_TAG_BYTES) {
      throw new Error('Corrupt payload')
    }
    const iv1 = packed1.subarray(0, AES_GCM_IV_BYTES)
    const ct1 = packed1.subarray(AES_GCM_IV_BYTES)
    const plain = decryptBuffer(keyA, iv1, ct1)
    return JSON.parse(plain.toString('utf8')) as DocPayload
  } catch {
    throw new Error('Cannot decrypt — wrong keys or corrupted file')
  }
}

export function serializeEnvelope(envelope: PutlEnvelope): string {
  return `${JSON.stringify(envelope, null, 2)}\n`
}

export function parseEnvelope(text: string): PutlEnvelope {
  const data = JSON.parse(text) as PutlEnvelope
  if (!data || data.v !== PUTL_ENVELOPE_VERSION || !data.ct || !data.iv2) {
    throw new Error('Invalid .putl file')
  }
  return data
}

export function generateDeviceSecret(): string {
  return randomBytes(DEVICE_SECRET_BYTES).toString('base64')
}

function verifyHash(layerKey: Buffer, domain: string, salt: Buffer): Buffer {
  const material = Buffer.concat([layerKey, Buffer.from(`\0${domain}`, 'utf8')])
  return scryptSync(material, salt, VERIFY_HASH_LEN, {
    N: VERIFY_SCRYPT_N,
    r: VERIFY_SCRYPT_R,
    p: VERIFY_SCRYPT_P,
    maxmem: VERIFY_SCRYPT_MAXMEM
  })
}

/** Build disk verifiers from derived layer keys (never store layer keys). */
export function createKeyVerifiers(layerA: Buffer, layerB: Buffer): VaultAuthConfig {
  const saltA = generateSalt()
  const saltB = generateSalt()
  const hashA = verifyHash(layerA, KDF_DOMAIN_VERIFY_A, saltA)
  const hashB = verifyHash(layerB, KDF_DOMAIN_VERIFY_B, saltB)
  return {
    kdf: 'scrypt',
    params: {
      N: VERIFY_SCRYPT_N,
      r: VERIFY_SCRYPT_R,
      p: VERIFY_SCRYPT_P,
      keyLen: VERIFY_HASH_LEN
    },
    saltA: saltA.toString('base64'),
    saltB: saltB.toString('base64'),
    hashA: hashA.toString('base64'),
    hashB: hashB.toString('base64')
  }
}

export function verifyKeyVerifiers(
  layerA: Buffer,
  layerB: Buffer,
  auth: VaultAuthConfig
): boolean {
  try {
    const saltA = Buffer.from(auth.saltA, 'base64')
    const saltB = Buffer.from(auth.saltB, 'base64')
    const expectA = Buffer.from(auth.hashA, 'base64')
    const expectB = Buffer.from(auth.hashB, 'base64')
    if (expectA.length !== VERIFY_HASH_LEN || expectB.length !== VERIFY_HASH_LEN) return false

    const n = auth.params?.N ?? VERIFY_SCRYPT_N
    const r = auth.params?.r ?? VERIFY_SCRYPT_R
    const p = auth.params?.p ?? VERIFY_SCRYPT_P
    const keyLen = auth.params?.keyLen ?? VERIFY_HASH_LEN

    const scryptOpts = { N: n, r, p, maxmem: VERIFY_SCRYPT_MAXMEM }
    const gotA = scryptSync(
      Buffer.concat([layerA, Buffer.from(`\0${KDF_DOMAIN_VERIFY_A}`, 'utf8')]),
      saltA,
      keyLen,
      scryptOpts
    )
    const gotB = scryptSync(
      Buffer.concat([layerB, Buffer.from(`\0${KDF_DOMAIN_VERIFY_B}`, 'utf8')]),
      saltB,
      keyLen,
      scryptOpts
    )
    if (gotA.length !== expectA.length || gotB.length !== expectB.length) return false
    const okA = timingSafeEqual(gotA, expectA)
    const okB = timingSafeEqual(gotB, expectB)
    return okA && okB
  } catch {
    return false
  }
}

export function authError(name: string, message: string): Error {
  const e = new Error(message)
  e.name = name
  return e
}
