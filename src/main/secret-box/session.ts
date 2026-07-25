import type { VaultConfig, VaultMode } from '@shared/secret-box/types'

export interface EphemeralAccess {
  rootPath: string
  mode: VaultMode
  config: VaultConfig
  keyA: Buffer
  keyB: Buffer
}

let access: EphemeralAccess | null = null

export function getAccess(): EphemeralAccess | null {
  return access
}

export function setAccess(next: EphemeralAccess | null): void {
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
