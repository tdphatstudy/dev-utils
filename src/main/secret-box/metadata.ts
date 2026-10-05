import { lstat, open } from 'fs/promises'
import { join } from 'path'
import { constants } from 'fs'
import { VAULT_CONFIG, VAULT_DIR, SCRYPT_PARAMS } from '@shared/secret-box/constants'
import { SALT_BYTES, VAULT_CONFIG_VERSION, VERIFY_HASH_LEN, VERIFY_SCRYPT_N, VERIFY_SCRYPT_R, VERIFY_SCRYPT_P } from '@shared/core/constants'
import type { VaultConfig } from '@shared/secret-box/types'

export class VaultMetadataError extends Error {
  constructor(public readonly code: 'MISSING' | 'CORRUPT' | 'UNREADABLE' | 'UNSUPPORTED', public readonly path: string, detail: string) {
    super(`Vault metadata ${code.toLowerCase()} at “${path}”. ${detail} Existing data was not replaced.`)
    this.name = 'VaultMetadataError'
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}
function base64(value: unknown, bytes: number): boolean {
  if (typeof value !== 'string') return false
  const decoded = Buffer.from(value, 'base64')
  return decoded.length === bytes && decoded.toString('base64') === value
}

/** Reject metadata this build cannot honor instead of deriving with different parameters. */
export function validateVaultConfig(value: unknown, path: string): VaultConfig {
  const config = object(value)
  const invalid = (detail: string): never => { throw new VaultMetadataError('CORRUPT', path, detail) }
  if (!config) return invalid('Expected a JSON object.')
  if (!Number.isInteger(config.version)) return invalid('Missing or invalid format version.')
  if (config.version !== VAULT_CONFIG_VERSION) throw new VaultMetadataError('UNSUPPORTED', path, `Format version ${config.version} is not supported by this build.`)
  if (config.mode !== 'device' && config.mode !== 'portable') return invalid('Invalid vault mode.')
  if (!base64(config.salt, SALT_BYTES)) return invalid(`Salt must be canonical Base64 containing ${SALT_BYTES} bytes. Restore the original metadata; a new salt cannot unlock old documents.`)
  if (typeof config.createdAt !== 'string' || !Number.isFinite(Date.parse(config.createdAt))) return invalid('Missing or invalid creation date.')
  const params = object(config.kdfParams)
  if (config.kdf !== 'scrypt' || !params || Object.entries(SCRYPT_PARAMS).some(([key, expected]) => params[key] !== expected)) {
    throw new VaultMetadataError('UNSUPPORTED', path, 'The vault key derivation parameters are not supported.')
  }
  if (config.auth !== undefined) {
    const auth = object(config.auth), verify = auth && object(auth.params)
    if (!auth || !verify || auth.kdf !== 'scrypt' || verify.N !== VERIFY_SCRYPT_N || verify.r !== VERIFY_SCRYPT_R || verify.p !== VERIFY_SCRYPT_P || verify.keyLen !== VERIFY_HASH_LEN) {
      throw new VaultMetadataError('UNSUPPORTED', path, 'The stored key verifier parameters are not supported.')
    }
    if (!base64(auth.saltA, SALT_BYTES) || !base64(auth.saltB, SALT_BYTES) || !base64(auth.hashA, VERIFY_HASH_LEN) || !base64(auth.hashB, VERIFY_HASH_LEN)) return invalid('Stored key verifiers are incomplete or malformed.')
  }
  return config as unknown as VaultConfig
}

export function parseMetadataBytes(buffer: Buffer, path: string): VaultConfig {
  let data: unknown
  try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer)) }
  catch { throw new VaultMetadataError('CORRUPT', path, 'JSON or UTF-8 is invalid. Check vault.json.bak or your original backup before recovering.') }
  return validateVaultConfig(data, path)
}

export async function readMetadata(root: string, backup = false): Promise<VaultConfig | null> {
  const buffer = await readMetadataBytes(root, backup)
  return buffer === null ? null : parseMetadataBytes(buffer, join(root, VAULT_DIR, VAULT_CONFIG) + (backup ? '.bak' : ''))
}

export async function readMetadataBytes(root: string, backup = false): Promise<Buffer | null> {
  const path = join(root, VAULT_DIR, VAULT_CONFIG) + (backup ? '.bak' : '')
  let file: Awaited<ReturnType<typeof open>> | undefined
  try {
    const parent = await lstat(join(root, VAULT_DIR))
    if (!parent.isDirectory() || parent.isSymbolicLink()) throw new VaultMetadataError('UNREADABLE', path, 'Metadata directory must be a real directory, not a link.')
    const before = await lstat(path)
    if (!before.isFile() || before.isSymbolicLink() || before.size > 256 * 1024) throw new VaultMetadataError('UNREADABLE', path, 'Metadata must be a regular file up to 256 KiB, not a link.')
    file = await open(path, constants.O_RDONLY | (process.platform === 'win32' ? 0 : constants.O_NOFOLLOW | constants.O_NONBLOCK))
    const stat = await file.stat()
    if (!stat.isFile() || stat.dev !== before.dev || stat.ino !== before.ino || stat.size !== before.size) throw new VaultMetadataError('UNREADABLE', path, 'The metadata file changed while opening it. Retry after checking the folder.')
    const buffer = Buffer.alloc(stat.size)
    let offset = 0
    while (offset < buffer.length) {
      const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, offset)
      if (!bytesRead) break
      offset += bytesRead
    }
    const after = await file.stat()
    if (offset !== buffer.length || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs) throw new VaultMetadataError('UNREADABLE', path, 'The metadata file changed while reading it. Retry after checking the folder.')
    return buffer
  } catch (e) {
    if (e instanceof VaultMetadataError) throw e
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw new VaultMetadataError('UNREADABLE', path, `Cannot read metadata (${(e as NodeJS.ErrnoException).code ?? 'I/O error'}). Check folder permissions and backup availability.`)
  } finally { await file?.close() }
}
