import { mkdir } from 'fs/promises'
import { basename, join, resolve } from 'path'
import { randomUUID } from 'crypto'
import { secretBoxRegistryPath, userDataRoot } from './paths'
import { atomicWriteFile } from './atomic-write'
import { readBoundedFile } from '../bounded-read'

const MAX_REGISTRY_BYTES = 1024 * 1024
const MAX_POINTER_BYTES = 16 * 1024

export interface VaultRegistryEntry {
  id: string
  name: string
  rootPath: string
  createdAt: string
  isDefault?: boolean
}

export interface VaultRegistry {
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

function emptyRegistry(): VaultRegistry {
  return { version: 1, activeId: null, vaults: [] }
}

function validateRegistry(data: VaultRegistry): void {
  const text = (value: unknown, max: number): boolean => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value)
  if (!data || data.version !== 1 || !Array.isArray(data.vaults) || data.vaults.length > 1024 ||
      (data.activeId !== null && !text(data.activeId, 128)) ||
      data.vaults.some(v => !v || !text(v.id, 128) || !text(v.rootPath, 4096) || !text(v.name, 4096) || !text(v.createdAt, 64) || v.isDefault !== undefined && typeof v.isDefault !== 'boolean') ||
      new Set(data.vaults.map(v => v.id)).size !== data.vaults.length || (data.activeId !== null && !data.vaults.some(v => v.id === data.activeId))) {
    throw new Error(`Box registry is invalid or unsupported at “${registryPath()}”. Preserve it and restore a known-good backup; no entries were discarded.`)
  }
}

const registryQueues = new Map<string, Promise<void>>()
export function inRegistryQueue<T>(operation: () => Promise<T>): Promise<T> {
  const path = registryPath()
  const previous = registryQueues.get(path) ?? Promise.resolve()
  const result = previous.then(operation)
  const tail = result.then(() => undefined, () => undefined)
  registryQueues.set(path, tail)
  void tail.then(() => { if (registryQueues.get(path) === tail) registryQueues.delete(path) })
  return result
}

export function readRegistry(): Promise<VaultRegistry> {
  return inRegistryQueue(readRegistryInternal)
}

// Only called while holding the registry queue, including legacy-pointer migration.
export async function readRegistryInternal(): Promise<VaultRegistry> {
  let raw: string
  try {
    raw = (await readBoundedFile(registryPath(), MAX_REGISTRY_BYTES)).toString('utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error(`Cannot read box registry. Check permissions at “${registryPath()}”; existing registry was not replaced.`)
    // migrate single pointer from older builds
    try {
      const raw = (await readBoundedFile(legacyPointerPath(), MAX_POINTER_BYTES)).toString('utf8')
      const ptr = JSON.parse(raw) as { rootPath?: string }
      if (typeof ptr?.rootPath === 'string' && ptr.rootPath.trim()) {
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
      throw new Error('Invalid legacy box pointer')
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error(`Cannot migrate the legacy box pointer at “${legacyPointerPath()}”. Preserve the file and restore its backup; no new registry was created.`)
    }
    return emptyRegistry()
  }
  let data: VaultRegistry
  try { data = JSON.parse(raw) as VaultRegistry }
  catch { throw new Error(`Box registry JSON is corrupt at “${registryPath()}”. Restore its backup; existing registry was not replaced.`) }
  validateRegistry(data)
  return data
}

export async function writeRegistry(reg: VaultRegistry, beforeCommit?: () => void): Promise<void> {
  validateRegistry(reg)
  const serialized = JSON.stringify(reg, null, 2)
  if (Buffer.byteLength(serialized) > MAX_REGISTRY_BYTES) throw new Error('Box registry exceeds 1 MiB. Existing registry was kept; no entries were discarded.')
  await mkdir(userDataRoot(), { recursive: true })
  await atomicWriteFile(registryPath(), serialized, 'utf8', 0o600, beforeCommit)
}
