export const AES_GCM_IV_BYTES = 12
export const AES_GCM_TAG_BYTES = 16
export const AES_256_KEY_BYTES = 32

export const SCRYPT_N = 16_384
export const SCRYPT_R = 8
export const SCRYPT_P = 1
export const SCRYPT_KEY_LEN = AES_256_KEY_BYTES

export const SALT_BYTES = 16
export const DEVICE_SECRET_BYTES = 32

export const PUTL_ENVELOPE_VERSION = 2 as const
export const VAULT_CONFIG_VERSION = 1 as const

export const KDF_DOMAIN_LAYER_A = 'putl-layer-a'
export const KDF_DOMAIN_LAYER_B = 'putl-layer-b'
export const KDF_DOMAIN_VERIFY_A = 'putl-verify-a'
export const KDF_DOMAIN_VERIFY_B = 'putl-verify-b'

/** Second-pass scrypt on derived layer keys — heavier than file-key scrypt (N=2^14) */
export const VERIFY_SCRYPT_N = 131_072 // 2^17
export const VERIFY_SCRYPT_R = 8
export const VERIFY_SCRYPT_P = 1
export const VERIFY_HASH_LEN = 64 // 512-bit verifier output
/** OpenSSL default maxmem is too low for high-N scrypt */
export const VERIFY_SCRYPT_MAXMEM = 256 * 1024 * 1024

export const MAX_AUTH_FAILURES = 5
export const AUTH_LOCKOUT_MS = 5 * 60 * 1000

/** Max raw bytes for image/video/audio import into Secret Box (.putl) */
export const MAX_PUTL_MEDIA_BYTES = 40 * 1024 * 1024
