import { existsSync } from 'fs'
import { mkdir, readdir, readFile } from 'fs/promises'
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
  VaultStatus
} from '@shared/secret-box/types'
import {
  defaultSecretBoxPath,
  secretBoxRegistryPath,
  userDataRoot
} from './paths'
import {
  assertNotLocked,
  clearAuthFailures,
  recordAuthFailure
} from './auth-rate'
import {
  authError,
  createKeyVerifiers,
  deriveLayerKeys,
  generateSalt,
  openDoc,
  parseEnvelope,
  verifyKeyVerifiers
} from './crypto'
import {
  listDeviceKeyCandidates,
  loadOrCreateDeviceSecret,
  cacheDeviceSecretHint
} from './device-secret'
import { atomicWriteFile, backupFile } from './atomic-write'
import { clearAccess, getAccess, setAccess } from './session'

interface VaultRegistryEntry {
  id: string
  name: string
  rootPath: string
  createdAt: string
  isDefault?: boolean
}

interface VaultRegistry {
  version: 1
  activeId: string | null
  vaults: VaultRegistryEntry[]
}

function registryPath(): string {
  return secretBoxRegistryPath()
}

function legacyPointerPath(): string {
  return join(userDataRoot(), 'privatebox-pointer.json')
}

async function emptyRegistry(): Promise<VaultRegistry> {
  return { version: 1, activeId: null, vaults: [] }
}

export async function readRegistry(): Promise<VaultRegistry> {
  try {
    const raw = await readFile(registryPath(), 'utf8')
    const data = JSON.parse(raw) as VaultRegistry
    if (!data || !Array.isArray(data.vaults)) return emptyRegistry()
    return {
      version: 1,
      activeId: data.activeId ?? null,
      vaults: data.vaults.filter((v) => v?.id && v?.rootPath)
    }
  } catch {
    // migrate single pointer from older builds
    try {
      const raw = await readFile(legacyPointerPath(), 'utf8')
      const ptr = JSON.parse(raw) as { rootPath?: string }
      if (ptr?.rootPath && existsSync(ptr.rootPath)) {
        const entry: VaultRegistryEntry = {
          id: randomUUID(),
          name: basename(ptr.rootPath) || 'Private Box',
          rootPath: resolve(ptr.rootPath),
          createdAt: new Date().toISOString()
        }
        const reg: VaultRegistry = { version: 1, activeId: entry.id, vaults: [entry] }
        await writeRegistry(reg)
        return reg
      }
    } catch {
      /* no legacy */
    }
    return emptyRegistry()
  }
}

async function writeRegistry(reg: VaultRegistry): Promise<void> {
  await mkdir(userDataRoot(), { recursive: true })
  await atomicWriteFile(registryPath(), JSON.stringify(reg, null, 2), 'utf8')
}

export async function isDirectoryEmpty(dir: string): Promise<boolean> {
  if (!existsSync(dir)) return false
  const entries = await readdir(dir, { withFileTypes: true })
  return entries.every((e) => isIgnorableName(e.name))
}

export function vaultConfigPath(root: string): string {
  return join(root, VAULT_DIR, VAULT_CONFIG)
}

export async function readVaultConfig(root: string): Promise<VaultConfig | null> {
  try {
    const raw = await readFile(vaultConfigPath(root), 'utf8')
    return JSON.parse(raw) as VaultConfig
  } catch {
    return null
  }
}

async function toListItems(reg: VaultRegistry): Promise<VaultListItem[]> {
  const items: VaultListItem[] = []
  for (const v of reg.vaults) {
    const config = await readVaultConfig(v.rootPath)
    items.push({
      id: v.id,
      name: v.name,
      rootPath: v.rootPath,
      mode: config?.mode ?? null,
      createdAt: v.createdAt,
      isDefault: !!v.isDefault
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

  const config = await readVaultConfig(active.rootPath)
  const root = resolve(active.rootPath)
  return {
    configured: true,
    hasAccess: !!access && access.rootPath === root,
    mode: config?.mode ?? null,
    rootPath: active.rootPath,
    activeId: active.id,
    vaults
  }
}

export async function setupVault(input: SetupInput): Promise<void> {
  const root = resolve(input.rootPath)
  if (!existsSync(root)) throw new Error('Folder does not exist')
  const empty = await isDirectoryEmpty(root)
  if (!empty) throw new Error('Folder must be empty')

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

  const keys = deriveLayerKeys(keyA, input.keyB, salt)
  const auth = createKeyVerifiers(keys.keyA, keys.keyB)
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
  await atomicWriteFile(vaultConfigPath(root), JSON.stringify(config, null, 2), 'utf8')

  const reg = await readRegistry()
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
  await writeRegistry(reg)
  await clearAuthFailures(root)

  setAccess({
    rootPath: root,
    mode: input.mode,
    config,
    keyA: keys.keyA,
    keyB: keys.keyB
  })
}

async function vaultHasPutlFiles(root: string): Promise<boolean> {
  async function walk(dir: string): Promise<boolean> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return false
    }
    for (const ent of entries) {
      if (ent.name === VAULT_DIR || ent.name.startsWith('.')) continue
      const full = join(dir, ent.name)
      if (ent.isDirectory()) {
        if (await walk(full)) return true
      } else if (ent.isFile() && isPutlFile(ent.name)) {
        return true
      }
    }
    return false
  }
  return walk(root)
}

/** Collect up to `limit` .putl paths for key proof. */
async function collectPutlPaths(root: string, limit = 5): Promise<string[]> {
  const found: string[] = []
  async function walk(dir: string): Promise<void> {
    if (found.length >= limit) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      if (found.length >= limit) return
      if (ent.name === VAULT_DIR || ent.name.startsWith('.')) continue
      const full = join(dir, ent.name)
      if (ent.isDirectory()) await walk(full)
      else if (ent.isFile() && isPutlFile(ent.name)) found.push(full)
    }
  }
  await walk(root)
  return found
}

/**
 * Fail-closed: every sampled .putl must decrypt (avoids mixed-key false positive).
 * Zero files → false (caller handles empty vault).
 */
async function canDecryptSamplePutls(
  root: string,
  keyA: Buffer,
  keyB: Buffer
): Promise<boolean> {
  const paths = await collectPutlPaths(root, 5)
  if (paths.length === 0) return false
  for (const full of paths) {
    try {
      const text = await readFile(full, 'utf8')
      openDoc(keyA, keyB, parseEnvelope(text))
    } catch {
      return false
    }
  }
  return true
}

async function writeConfig(root: string, config: VaultConfig): Promise<void> {
  await mkdir(join(root, VAULT_DIR), { recursive: true })
  const path = vaultConfigPath(root)
  await backupFile(path, '.bak')
  await atomicWriteFile(path, JSON.stringify(config, null, 2), 'utf8')
}

export async function accessVault(input: AccessInput): Promise<void> {
  const active = await getActiveEntry()
  if (!active) throw new Error('No vault selected')
  const root = resolve(active.rootPath)
  if (!existsSync(root)) {
    throw authError('INVALID_VAULT', 'Vault folder is missing on disk')
  }

  await assertNotLocked(root)

  let config = await readVaultConfig(root)
  if (!config) throw new Error('Vault metadata missing')

  if (!input.keyB.trim()) throw new Error('Key B / password is required')

  const salt = Buffer.from(config.salt, 'base64')

  /** keyA string candidates (device: hardware + legacy; portable: user keyA) */
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
  const hasFiles = await vaultHasPutlFiles(root)

  let accepted: { keyA: Buffer; keyB: Buffer } | null = null

  for (const keyAStr of keyAList) {
    const keys = deriveLayerKeys(keyAStr, input.keyB, salt)

    if (hasAuth) {
      if (verifyKeyVerifiers(keys.keyA, keys.keyB, config.auth!)) {
        accepted = keys
        break
      }
      continue
    }

    // Legacy vault without verifiers — prove by decrypting existing .putl files
    if (hasFiles) {
      if (await canDecryptSamplePutls(root, keys.keyA, keys.keyB)) {
        accepted = keys
        break
      }
      continue
    }

    // Empty legacy vault: bind first successful password (one-time migration)
    accepted = keys
    break
  }

  if (!accepted) {
    await recordAuthFailure(root)
    throw authError(
      'INVALID_KEYS',
      'Wrong password / keys. Access denied — no session started. Data on disk was not modified.'
    )
  }

  // Migrate legacy → verifiers only after proof (or empty bind)
  if (!hasAuth) {
    config = {
      ...config,
      auth: createKeyVerifiers(accepted.keyA, accepted.keyB)
    }
    await writeConfig(root, config)
  }

  if (config.mode === 'device') {
    // Cache material that worked (best-effort; hardware remains preferred source)
    for (const keyAStr of keyAList) {
      const trial = deriveLayerKeys(keyAStr, input.keyB, salt)
      if (trial.keyA.equals(accepted.keyA)) {
        void cacheDeviceSecretHint(keyAStr)
        break
      }
    }
  }

  await clearAuthFailures(root)
  setAccess({
    rootPath: root,
    mode: config.mode,
    config,
    keyA: accepted.keyA,
    keyB: accepted.keyB
  })
}

export function clearVaultAccess(): void {
  clearAccess()
}

export async function openExistingVaultPath(
  rootPath: string,
  name?: string
): Promise<VaultConfig> {
  const root = resolve(rootPath)
  const config = await readVaultConfig(root)
  if (!config) throw new Error('Not a Private Box folder')

  const reg = await readRegistry()
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
  await writeRegistry(reg)
  clearAccess()
  return config
}

export async function setActiveVault(id: string): Promise<void> {
  const reg = await readRegistry()
  const found = reg.vaults.find((v) => v.id === id)
  if (!found) throw new Error('Vault not found')
  if (!existsSync(found.rootPath)) {
    throw new Error('Vault folder is missing on disk')
  }
  reg.activeId = id
  await writeRegistry(reg)
  clearAccess()
}

export async function removeVaultFromList(id: string): Promise<void> {
  const reg = await readRegistry()
  const access = getAccess()
  const target = reg.vaults.find((v) => v.id === id)
  reg.vaults = reg.vaults.filter((v) => v.id !== id)
  if (reg.activeId === id) {
    reg.activeId = reg.vaults[0]?.id ?? null
    clearAccess()
  } else if (access && target && resolve(access.rootPath) === resolve(target.rootPath)) {
    clearAccess()
  }
  await writeRegistry(reg)
}

export async function renameVault(id: string, name: string): Promise<void> {
  const reg = await readRegistry()
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

export async function ensureDefaultSecretBox(): Promise<VaultListItem> {
  const root = defaultSecretBoxPath()
  await mkdir(root, { recursive: true })

  let config = await readVaultConfig(root)
  if (!config) {
    // Probe device key material early (hardware-bound) so default box is OS-reinstall safe
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

  const reg = await readRegistry()
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
  } else {
    entry.isDefault = true
    entry.name = entry.name || 'Default Secret Box'
  }

  if (!reg.activeId) reg.activeId = entry.id
  await writeRegistry(reg)

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
