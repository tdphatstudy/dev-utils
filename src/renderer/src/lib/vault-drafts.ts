import type { VaultDraft } from '@shared/security-policy'

// Sensitive drafts never enter Zustand, localStorage or generic tool history.
const readers = new Set<() => VaultDraft | null>()
export function registerVaultDraft(reader: () => VaultDraft | null): () => void {
  readers.add(reader)
  return () => readers.delete(reader)
}
export function captureVaultDraft(): VaultDraft | null {
  for (const reader of readers) { const draft = reader(); if (draft) return draft }
  return null
}
export function parseVaultDraft(value: string): VaultDraft {
  const draft: unknown = JSON.parse(value)
  if (!draft || typeof draft !== 'object') throw new Error('Protected draft is invalid.')
  const data = draft as Record<string, unknown>
  if (!['document', 'keep'].includes(String(data.kind)) || typeof data.content !== 'string' ||
      (data.path !== undefined && (typeof data.path !== 'string' || data.path.length > 4096)) ||
      (data.composer !== undefined && typeof data.composer !== 'string')) throw new Error('Protected draft is invalid.')
  return data as unknown as VaultDraft
}
