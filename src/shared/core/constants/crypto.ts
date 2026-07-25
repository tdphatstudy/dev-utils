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
