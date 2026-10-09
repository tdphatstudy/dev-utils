import { existsSync } from 'fs'
import { mkdir, readdir } from 'fs/promises'
import { basename, join, resolve } from 'path'
import { randomUUID } from 'crypto'
import { VAULT_CONFIG_VERSION } from '@shared/core/constants'
import { PUTL_EXT, SCRYPT_PARAMS, VAULT_CONFIG, VAULT_DIR } from '@shared/secret-box/constants'
import { isIgnorableName } from '@shared/secret-box/path-utils'
import type {
  AccessInput,
  SetupInput,
  VaultConfig,
  VaultListItem,
  VaultStatus,
  RecoverMetadataInput, RecoverMetadataResult
} from '@shared/secret-box/types'
import { defaultSecretBoxPath } from './paths'
import {
  assertNotLocked,
  clearAuthFailures,
  recordAuthFailure
} from './auth-rate'
import {
  authError,
  generateSalt,
  openDoc,
  parseEnvelope
} from './crypto'
import {
  listDeviceKeyCandidates,
  loadOrCreateDeviceSecret
} from './device-secret'
import { atomicWriteFile, backupFile } from './atomic-write'
import { clearAccess, getAccess, setAccess, getAccessRevision, assertAccessRevision, getSessionId } from './session'
import { readMetadata, VaultMetadataError } from './metadata'
import { recoverMetadataAtRoot } from './recovery'
import { createKeyVerifiersAsync, deriveLayerKeysAsync, verifyKeyVerifiersAsync } from './async-kdf'
import { readBoundedFile } from '../bounded-read'
import { readRegistry, inRegistryQueue, readRegistryInternal, writeRegistry, type VaultRegistry, type VaultRegistryEntry } from './registry'
import { collectLegacyProofPaths } from './legacy-proof'
import { MAX_ENVELOPE_BYTES } from '@shared/secret-box/limits'

export { readRegistry } from './registry'

export async function isDirectoryEmpty(dir: string): Promise<boolean> {
  if (!existsSync(dir)) return false
  const entries = await readdir(dir, { withFileTypes: true })
  return entries.every((e) => isIgnorableName(e.name))
}

export function vaultConfigPath(root: string): string {
  return join(root, VAULT_DIR, VAULT_CONFIG)
}

export async function readVaultConfig(root: string): Promise<VaultConfig | null> {
  return readMetadata(root)
}

async function toListItems(reg: VaultRegistry): Promise<VaultListItem[]> {
  const items: VaultListItem[] = []
  for (const v of reg.vaults) {
    let config: VaultConfig | null = null
    let metadataError: string | undefined
    let metadataBackupPath: string | undefined
    try {
      config = await readVaultConfig(v.rootPath)
      if (!config) metadataError = new VaultMetadataError('MISSING', vaultConfigPath(v.rootPath), 'Restore the original metadata or its backup before unlocking.').message
    } catch (e) {
      if (!(e instanceof VaultMetadataError)) throw e
      metadataError = e.message
    }
    if (metadataError) {
      try {
        const backup = await readMetadata(v.rootPath, true)
        if (backup) { config = backup; metadataBackupPath = `${vaultConfigPath(v.rootPath)}.bak` }
      } catch { /* An invalid backup is not a recovery candidate. */ }
    }
    items.push({
      id: v.id,
      name: v.name,
      rootPath: v.rootPath,
      mode: config?.mode ?? null,
      createdAt: v.createdAt,
      isDefault: !!v.isDefault,
      metadataError, metadataBackupPath
    })
  }
  return items
}

export async function getActiveEntry(): Promise<VaultRegistryEntry | null> {
  const reg = await readRegistry()
  if (!reg.activeId) return null
  return reg.vaults.find((v) => v.id === reg.activeId) ?? null
}

export async function getStatus(): Promise<VaultStatus> {
  const reg = await readRegistry()
  const vaults = await toListItems(reg)
  const access = getAccess()
  const active = reg.vaults.find((v) => v.id === reg.activeId) ?? null

  if (!active) {
    return {
      configured: vaults.length > 0,
      hasAccess: false,
      mode: null,
      rootPath: null,
      activeId: null,
      vaults
    }
  }

  const item = vaults.find((v) => v.id === active.id)
  if (item?.metadataError && access?.rootPath === resolve(active.rootPath)) clearAccess()
  const root = resolve(active.rootPath)
  return {
    configured: true,
    hasAccess: !!access && access.rootPath === root && !item?.metadataError,
    mode: item?.mode ?? null,
    rootPath: active.rootPath,
    activeId: active.id,
    vaults,
    sessionId: access && access.rootPath === root && !item?.metadataError ? getSessionId() : undefined
  }
}

export function setupVault(input: SetupInput): Promise<void> {
  const revision = getAccessRevision()
  return inRegistryQueue(() => { assertAccessRevision(revision); return setupVaultInternal(input) })
}
async function setupVaultInternal(input: SetupInput): Promise<void> {
  const revision = getAccessRevision()
  const root = resolve(input.rootPath)
  if (!existsSync(root)) throw new Error('Folder does not exist')
  const empty = await isDirectoryEmpty(root)
  if (!empty) throw new Error('Folder must be empty')
  const reg = await readRegistryInternal()
  assertAccessRevision(revision)

  if (input.mode === 'portable') {
    if (!input.keyA.trim() || !input.keyB.trim()) {
      throw new Error('Both keys are required for portable mode')
    }
  } else if (!input.keyB.trim()) {
    throw new Error('Password is required')
  }

  const salt = generateSalt()
  let keyA = input.keyA
  if (input.mode === 'device') {
    keyA = await loadOrCreateDeviceSecret()
  }
  assertAccessRevision(revision)

  const keys = await deriveLayerKeysAsync(keyA, input.keyB, salt)
  let transferred = false
  try {
    assertAccessRevision(revision)
    const auth = await createKeyVerifiersAsync(keys.keyA, keys.keyB)
    assertAccessRevision(revision)
    const config: VaultConfig = {
      version: VAULT_CONFIG_VERSION,
      mode: input.mode,
      kdf: 'scrypt',
      kdfParams: {
        N: SCRYPT_PARAMS.N,
        r: SCRYPT_PARAMS.r,
        p: SCRYPT_PARAMS.p,
        keyLen: SCRYPT_PARAMS.keyLen
      },
      salt: salt.toString('base64'),
      createdAt: new Date().toISOString(),
      auth
    }

    await mkdir(join(root, VAULT_DIR), { recursive: true })
    assertAccessRevision(revision)
    await atomicWriteFile(vaultConfigPath(root), JSON.stringify(config, null, 2), 'utf8', undefined, () => assertAccessRevision(revision))
    assertAccessRevision(revision)

    const existing = reg.vaults.find((v) => resolve(v.rootPath) === root)
    if (existing) {
      existing.name = input.name?.trim() || existing.name
      reg.activeId = existing.id
    } else {
      const entry: VaultRegistryEntry = {
        id: randomUUID(),
        name: input.name?.trim() || basename(root) || 'Private Box',
        rootPath: root,
        createdAt: new Date().toISOString()
      }
      reg.vaults.push(entry)
      reg.activeId = entry.id
    }
    await writeRegistry(reg, () => assertAccessRevision(revision))
    await clearAuthFailures(root)
    assertAccessRevision(revision)

    setAccess({
      rootPath: root,
      mode: input.mode,
      config,
      keyA: keys.keyA,
      keyB: keys.keyB
    })
    transferred = true
  } finally { if (!transferred) { keys.keyA.fill(0); keys.keyB.fill(0) } }
}

/**
 * Fail-closed: every sampled .putl must decrypt (avoids mixed-key false positive).
 * Zero files → false (caller handles empty vault).
 */
async function canDecryptSamplePutls(
  paths: string[],
  keyA: Buffer,
  keyB: Buffer
): Promise<boolean> {
  if (paths.length === 0) return false
  for (const full of paths) {
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(await readBoundedFile(full, MAX_ENVELOPE_BYTES))
      openDoc(keyA, keyB, parseEnvelope(text))
    } catch {
      return false
    }
  }
  return true
}

async function writeConfig(root: string, config: VaultConfig, beforeCommit?: () => void): Promise<void> {
  await mkdir(join(root, VAULT_DIR), { recursive: true })
  const path = vaultConfigPath(root)
  await backupFile(path, '.bak')
  beforeCommit?.()
  await atomicWriteFile(path, JSON.stringify(config, null, 2), 'utf8', undefined, beforeCommit)
}

export async function accessVault(input: AccessInput): Promise<void> {
  const revision = getAccessRevision()
  const active = await getActiveEntry()
  assertAccessRevision(revision)
  if (!active) throw new Error('No vault selected')
  const root = resolve(active.rootPath)
  if (!existsSync(root)) {
    throw authError('INVALID_VAULT', 'Vault folder is missing on disk')
  }

  await assertNotLocked(root)
  assertAccessRevision(revision)

  let config = await readVaultConfig(root)
  assertAccessRevision(revision)
  if (!config) throw new Error('Vault metadata missing')

  if (!input.keyB.trim()) throw new Error('Key B / password is required')

  const salt = Buffer.from(config.salt, 'base64')

  let keyAList: string[] = []
  if (config.mode === 'device') {
    const candidates = await listDeviceKeyCandidates()
    keyAList = candidates.map((c) => c.keyA)
  } else {
    const keyA = input.keyA ?? ''
    if (!keyA.trim()) throw new Error('Key A is required')
    keyAList = [keyA]
  }

  const hasAuth = !!(config.auth?.hashA && config.auth?.hashB)
  const proofPaths = hasAuth ? [] : await collectLegacyProofPaths(root, 5, () => assertAccessRevision(revision))
  const hasFiles = proofPaths.length > 0
  assertAccessRevision(revision)

  let accepted: { keyA: Buffer; keyB: Buffer } | null = null
  let transferred = false
  try {
    for (const keyAStr of keyAList) {
      const keys = await deriveLayerKeysAsync(keyAStr, input.keyB, salt)
      let keep = false
      try {
        assertAccessRevision(revision)
        if (hasAuth) {
          const verified = await verifyKeyVerifiersAsync(keys.keyA, keys.keyB, config.auth!)
          assertAccessRevision(revision)
          if (verified) {
            accepted = keys
            keep = true
            break
          }
          continue
        }

        // Legacy vault without verifiers — prove by decrypting existing .putl files
        if (hasFiles) {
          if (await canDecryptSamplePutls(proofPaths, keys.keyA, keys.keyB)) {
            accepted = keys
            keep = true
            break
          }
          continue
        }

        // Empty legacy vault: bind first successful password (one-time migration)
        accepted = keys
        keep = true
        break
      } finally { if (!keep) { keys.keyA.fill(0); keys.keyB.fill(0) } }
    }

    assertAccessRevision(revision)
    if (!accepted) {
      await recordAuthFailure(root)
      throw authError(
        'INVALID_KEYS',
        'Wrong password / keys. Access denied — no session started. Data on disk was not modified.'
      )
    }

    const stillActive = await getActiveEntry()
    assertAccessRevision(revision)
    if (stillActive?.id !== active.id || resolve(stillActive.rootPath) !== root) throw authError('SESSION_CHANGED', 'SESSION_CHANGED: Selected box changed while signing in. Retry in the selected box.')

    if (!hasAuth) {
      config = {
        ...config,
        auth: await createKeyVerifiersAsync(accepted.keyA, accepted.keyB)
      }
      await writeConfig(root, config, () => assertAccessRevision(revision))
    }

    await clearAuthFailures(root)
    assertAccessRevision(revision)
    setAccess({
      rootPath: root,
      mode: config.mode,
      config,
      keyA: accepted.keyA,
      keyB: accepted.keyB
    })
    transferred = true
  } finally { if (accepted && !transferred) { accepted.keyA.fill(0); accepted.keyB.fill(0) } }
}

export function clearVaultAccess(): void {
  clearAccess()
}

export function recoverVaultMetadata(input: RecoverMetadataInput): Promise<RecoverMetadataResult> {
  clearAccess()
  const revision = getAccessRevision()
  return inRegistryQueue(async () => {
    const check = (): void => assertAccessRevision(revision)
    check()
    const registry = await readRegistryInternal(); check()
    const entry = registry.vaults.find((box) => box.id === input.boxId)
    if (!entry || registry.activeId !== input.boxId) throw new Error('SESSION_CHANGED: Select the box whose metadata you want to recover.')
    const root = resolve(entry.rootPath)
    const outcome = await recoverMetadataAtRoot(root, input, check)
    try {
      check()
      setAccess({ rootPath: root, mode: outcome.config.mode, config: outcome.config, keyA: outcome.keyA, keyB: outcome.keyB })
      return outcome.result
    } catch (e) { outcome.keyA.fill(0); outcome.keyB.fill(0); throw e }
  })
}

export function openExistingVaultPath(rootPath: string, name?: string): Promise<VaultConfig> {
  const revision = getAccessRevision()
  return inRegistryQueue(() => { assertAccessRevision(revision); return openExistingVaultPathInternal(rootPath, name) })
}
async function openExistingVaultPathInternal(
  rootPath: string,
  name?: string
): Promise<VaultConfig> {
  const initialRevision = getAccessRevision()
  const root = resolve(rootPath)
  let config: VaultConfig | null
  try { config = await readVaultConfig(root) }
  catch (e) {
    if (!(e instanceof VaultMetadataError) || e.code !== 'CORRUPT') throw e
    config = await readMetadata(root, true)
  }
  if (!config) config = await readMetadata(root, true)
  if (!config) throw new Error('Not a Private Box folder')

  const reg = await readRegistryInternal()
  assertAccessRevision(initialRevision)
  let entry = reg.vaults.find((v) => resolve(v.rootPath) === root)
  if (!entry) {
    entry = {
      id: randomUUID(),
      name: name?.trim() || basename(root) || 'Private Box',
      rootPath: root,
      createdAt: new Date().toISOString()
    }
    reg.vaults.push(entry)
  }
  reg.activeId = entry.id
  clearAccess()
  const revision = getAccessRevision()
  await writeRegistry(reg, () => assertAccessRevision(revision))
  assertAccessRevision(revision)
  return config
}

export function setActiveVault(id: string): Promise<void> {
  // Invalidate pending unlocks and file jobs before asynchronous registry IO.
  clearAccess()
  const revision = getAccessRevision()
  return inRegistryQueue(() => { assertAccessRevision(revision); return setActiveVaultInternal(id, revision) })
}
async function setActiveVaultInternal(id: string, revision: number): Promise<void> {
  const reg = await readRegistryInternal()
  assertAccessRevision(revision)
  const found = reg.vaults.find((v) => v.id === id)
  if (!found) throw new Error('Vault not found')
  if (!existsSync(found.rootPath)) {
    throw new Error('Vault folder is missing on disk')
  }
  reg.activeId = id
  await writeRegistry(reg, () => assertAccessRevision(revision))
  assertAccessRevision(revision)
}

export function removeVaultFromList(id: string): Promise<void> {
  return inRegistryQueue(() => removeVaultFromListInternal(id))
}
async function removeVaultFromListInternal(id: string): Promise<void> {
  const reg = await readRegistryInternal()
  const access = getAccess()
  const target = reg.vaults.find((v) => v.id === id)
  if (!target) throw new Error('Vault not found')
  reg.vaults = reg.vaults.filter((v) => v.id !== id)
  if (reg.activeId === id) {
    reg.activeId = reg.vaults[0]?.id ?? null
    clearAccess()
  } else if (access && target && resolve(access.rootPath) === resolve(target.rootPath)) {
    clearAccess()
  }
  await writeRegistry(reg)
}

export function renameVault(id: string, name: string): Promise<void> {
  return inRegistryQueue(() => renameVaultInternal(id, name))
}
async function renameVaultInternal(id: string, name: string): Promise<void> {
  const reg = await readRegistryInternal()
  const entry = reg.vaults.find((v) => v.id === id)
  if (!entry) throw new Error('Vault not found')
  const next = name.trim()
  if (!next) throw new Error('Name required')
  entry.name = next
  await writeRegistry(reg)
}

export function isPutlFile(name: string): boolean {
  return name.toLowerCase().endsWith(PUTL_EXT)
}

export function ensureDefaultSecretBox(): Promise<VaultListItem> {
  return inRegistryQueue(ensureDefaultSecretBoxInternal)
}
async function ensureDefaultSecretBoxInternal(): Promise<VaultListItem> {
  const reg = await readRegistryInternal()
  let registryChanged = false
  const root = defaultSecretBoxPath()
  await mkdir(root, { recursive: true })

  let config = await readVaultConfig(root)
  if (!config) {
    if (!(await isDirectoryEmpty(root))) {
      throw new VaultMetadataError('MISSING', vaultConfigPath(root), 'This folder already contains data or metadata remnants. Restore the original vault.json; a new salt would make existing encrypted documents unreadable.')
    }
    await loadOrCreateDeviceSecret()
    const salt = generateSalt()
    config = {
      version: VAULT_CONFIG_VERSION,
      mode: 'device',
      kdf: 'scrypt',
      kdfParams: {
        N: SCRYPT_PARAMS.N,
        r: SCRYPT_PARAMS.r,
        p: SCRYPT_PARAMS.p,
        keyLen: SCRYPT_PARAMS.keyLen
      },
      salt: salt.toString('base64'),
      createdAt: new Date().toISOString()
    }
    await mkdir(join(root, VAULT_DIR), { recursive: true })
    await atomicWriteFile(vaultConfigPath(root), JSON.stringify(config, null, 2), 'utf8')
    await mkdir(join(root, 'keep'), { recursive: true })
    await mkdir(join(root, 'saves'), { recursive: true })
  }

  const resolved = resolve(root)
  let entry = reg.vaults.find((v) => resolve(v.rootPath) === resolved)
  if (!entry) {
    entry = {
      id: randomUUID(),
      name: 'Default Secret Box',
      rootPath: root,
      createdAt: config.createdAt,
      isDefault: true
    }
    reg.vaults.unshift(entry)
    registryChanged = true
  } else {
    if (!entry.isDefault || !entry.name) registryChanged = true
    entry.isDefault = true
    entry.name = entry.name || 'Default Secret Box'
  }

  if (!reg.activeId) { reg.activeId = entry.id; registryChanged = true }
  if (registryChanged) await writeRegistry(reg)

  return {
    id: entry.id,
    name: entry.name,
    rootPath: entry.rootPath,
    mode: config.mode,
    createdAt: entry.createdAt,
    isDefault: true
  }
}

export async function getDefaultVaultEntry(): Promise<VaultRegistryEntry | null> {
  await ensureDefaultSecretBox()
  const reg = await readRegistry()
  return (
    reg.vaults.find((v) => v.isDefault) ??
    reg.vaults.find((v) => resolve(v.rootPath) === resolve(defaultSecretBoxPath())) ??
    null
  )
}
