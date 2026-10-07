export const VAULT_IDLE_MINUTES = [5, 15, 30, 60] as const
export type VaultIdleMinutes = typeof VAULT_IDLE_MINUTES[number]
export type VaultLockReason = 'idle' | 'screen-lock' | 'suspend' | 'manual'
export interface VaultLockEvent { id: string; reason: VaultLockReason; canPreserveDraft: boolean }
export interface SecurityState { idleMinutes: VaultIdleMinutes; lastLock: VaultLockEvent | null; hasDraft: boolean }
export function isVaultIdleMinutes(value: unknown): value is VaultIdleMinutes {
  return typeof value === 'number' && (VAULT_IDLE_MINUTES as readonly number[]).includes(value)
}
export function isVaultLockEvent(value: unknown): value is VaultLockEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Record<string, unknown>
  return typeof event.id === 'string' && /^[a-f0-9-]{36}$/.test(event.id) &&
    ['idle', 'screen-lock', 'suspend', 'manual'].includes(String(event.reason)) && typeof event.canPreserveDraft === 'boolean'
}
export interface VaultDraft { kind: 'document' | 'keep'; path?: string; content: string; composer?: string }
export interface RecoveredVaultDraft { id: string; content: string }
