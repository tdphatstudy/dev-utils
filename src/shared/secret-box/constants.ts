import {
  APP_DATA_DIR,
  DEFAULT_SECRET_BOX_DIR,
  PUTL_EXTENSION,
  SECRET_BOX_CONFIG_FILE,
  SECRET_BOX_META_DIR,
  SCRYPT_KEY_LEN,
  SCRYPT_N,
  SCRYPT_P,
  SCRYPT_R
} from '../core/constants'

/** @deprecated Prefer SECRET_BOX_META_DIR — kept for on-disk compat */
export const VAULT_DIR = SECRET_BOX_META_DIR
export const VAULT_CONFIG = SECRET_BOX_CONFIG_FILE
export const PUTL_EXT = PUTL_EXTENSION

export const SCRYPT_PARAMS = {
  N: SCRYPT_N,
  r: SCRYPT_R,
  p: SCRYPT_P,
  keyLen: SCRYPT_KEY_LEN
} as const

export const IGNORED_EMPTY_NAMES = new Set([
  '.ds_store',
  'thumbs.db',
  'desktop.ini',
  '.gitkeep'
])

export const DEFAULT_BOX_RELATIVE = `${APP_DATA_DIR}/${DEFAULT_SECRET_BOX_DIR}`
