import type { VaultConfig, VaultMode } from '@shared/secret-box/types'
import { randomUUID } from 'crypto'

export interface EphemeralAccess {
  rootPath: string
  mode: VaultMode
  config: VaultConfig
  keyA: Buffer
  keyB: Buffer
}

let access: EphemeralAccess | null = null
let revision = 0
let sessionId: string | undefined
let ownerId: number | undefined
const observers = new Set<() => void>()
export function getSessionOwner(): number | undefined { return ownerId }
export function observeAccess(callback: () => void): () => void { observers.add(callback); return () => observers.delete(callback) }

export function getSessionId(): string | undefined { return sessionId }
export function bindSessionOwner(id: number): void { requireAccess(); ownerId = id }
export function assertSessionId(expected: unknown, senderId?: number): void {
  requireAccess()
  if (expected !== sessionId || (ownerId !== undefined && senderId !== undefined && ownerId !== senderId)) throw sessionChanged()
}
export function clearAccessForOwner(id: number): void {
  if (ownerId === undefined || ownerId === id) clearAccess()
}

export function getAccessRevision(): number { return revision }
export function assertAccessRevision(expected: number): void {
  if (revision !== expected) throw sessionChanged()
}
function sessionChanged(): Error {
  const error = new Error('SESSION_CHANGED: Box session changed. Sign in again and retry; this operation did not continue in another box.')
  error.name = 'SESSION_CHANGED'
  return error
}
export function assertAccess(expected: EphemeralAccess): void {
  if (access !== expected) throw sessionChanged()
}

export function getAccess(): EphemeralAccess | null {
  return access
}

export function setAccess(next: EphemeralAccess | null): void {
  revision++
  if (access === next) return
  if (access) {
    access.keyA.fill(0)
    access.keyB.fill(0)
  }
  access = next
  sessionId = next ? randomUUID() : undefined
  ownerId = undefined
  for (const observer of observers) { try { observer() } catch { /* Native UI failure must not interrupt key invalidation or other observers. */ } }
}

export function requireAccess(): EphemeralAccess {
  if (!access) {
    const err = new Error('NEEDS_ACCESS')
    err.name = 'NEEDS_ACCESS'
    throw err
  }
  return access
}

export function clearAccess(): void {
  setAccess(null)
}
