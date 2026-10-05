import { PUTL_ENVELOPE_VERSION, VAULT_CONFIG_VERSION } from '@shared/core/constants'
import { CONTENT_KIND_IDS, type ContentKindId, getContentKind } from './content-kinds'

export type VaultMode = 'device' | 'portable'
export type DocType = ContentKindId

/** Stored key verifiers — never raw keys/passwords */
export interface VaultAuthConfig {
  kdf: 'scrypt'
  params: {
    N: number
    r: number
    p: number
    keyLen: number
  }
  saltA: string
  saltB: string
  /** scrypt(layerA || domain, saltA) base64 — 64 bytes */
  hashA: string
  /** scrypt(layerB || domain, saltB) base64 — 64 bytes */
  hashB: string
}

export interface VaultConfig {
  version: typeof VAULT_CONFIG_VERSION
  mode: VaultMode
  kdf: 'scrypt'
  kdfParams: {
    N: number
    r: number
    p: number
    keyLen: number
  }
  salt: string
  createdAt: string
  /** Required for new vaults; migrated on first successful unlock for legacy */
  auth?: VaultAuthConfig
}

export interface PutlEnvelope {
  v: typeof PUTL_ENVELOPE_VERSION
  mode: VaultMode
  kdf: 'scrypt'
  salt: string
  iv1: string
  iv2: string
  ct: string
}

export type DocEncoding = 'utf-8' | 'base64'

export interface DocPayload {
  name: string
  type: DocType
  /** utf-8 text, or base64 for image/video/audio/binary */
  encoding: DocEncoding
  createdAt: string
  updatedAt: string
  content: string
  /** MIME type for media playback (optional on legacy text docs) */
  mimeType?: string
}

export interface DirEntry {
  id: string
  name: string
  kind: 'file' | 'dir'
  type?: DocType
  updatedAt?: string
  relativePath: string
}

export interface VaultListItem {
  id: string
  name: string
  rootPath: string
  mode: VaultMode | null
  createdAt: string
  isDefault?: boolean
  metadataError?: string
  /** Validated metadata backup exists; it is not automatically restored. */
  metadataBackupPath?: string
}

export interface VaultStatus {
  configured: boolean
  hasAccess: boolean
  mode: VaultMode | null
  rootPath: string | null
  activeId: string | null
  vaults: VaultListItem[]
  initializationError?: string
}

export interface SetupInput {
  rootPath: string
  mode: VaultMode
  keyA: string
  keyB: string
  name?: string
}

export interface AccessInput {
  keyA?: string
  keyB: string
}

export interface RecoverMetadataInput extends AccessInput { boxId: string }
export interface RecoverMetadataResult {
  checkedDocuments: number
  backupPath: string
  preservedMetadataPath?: string
}

export interface DocContent {
  id: string
  name: string
  type: DocType
  content: string
  relativePath: string
  updatedAt: string
  encoding?: DocEncoding
  mimeType?: string
}

export const DOC_EXT: Record<DocType, string> = Object.fromEntries(
  CONTENT_KIND_IDS.map((id) => [id, getContentKind(id).extension])
) as Record<DocType, string>

export function typeFromName(name: string): DocType {
  const lower = name.toLowerCase()
  const ranked = CONTENT_KIND_IDS.slice().sort(
    (a, b) =>
      Math.max(...getContentKind(b).extensions.map((e) => e.length)) -
      Math.max(...getContentKind(a).extensions.map((e) => e.length))
  )
  for (const id of ranked) {
    const kind = getContentKind(id)
    if (kind.extensions.some((ext) => lower.endsWith(ext))) return id
  }
  // Unknown extension → generic binary if it has a dotted extension, else text
  if (/\.[a-z0-9]{1,12}$/i.test(lower)) return 'binary'
  return 'text'
}

/** Soft limit for encrypted media inside .putl (base64 + dual AES expands further). */
export const MAX_MEDIA_BYTES = 40 * 1024 * 1024

export function ensureExtension(name: string, type: DocType): string {
  const trimmed = name.trim()
  const kind = getContentKind(type)
  if (!trimmed) return `untitled${kind.extension}`
  if (kind.extensions.some((ext) => trimmed.toLowerCase().endsWith(ext))) return trimmed
  if (/\.[a-z0-9]{1,12}$/i.test(trimmed)) return trimmed
  return `${trimmed}${kind.extension}`
}
