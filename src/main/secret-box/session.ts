import type { VaultConfig, VaultMode } from '@shared/secret-box/types'

export interface EphemeralAccess {
  rootPath: string
  mode: VaultMode
  config: VaultConfig
  keyA: Buffer
  keyB: Buffer
}

let access: EphemeralAccess | null = null
let revision = 0

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
