export const MAX_CLIP_TEXT = 256 * 1024
export const MAX_CLIP_IMAGE = 4 * 1024 * 1024
export const MAX_CLIP_MEMORY = 24 * 1024 * 1024
export const CLIP_RETENTION = [1, 7, 30] as const
export type ClipKind = 'text' | 'json' | 'url' | 'color' | 'image'
export interface ClipboardPreferences {
  enabled: boolean
  persist: boolean
  retentionDays: 1 | 7 | 30
  maxEntries: number
  excludeText: string[]
}
export const DEFAULT_CLIPBOARD: ClipboardPreferences = { enabled: true, persist: false, retentionDays: 1, maxEntries: 200, excludeText: [] }
export interface ClipSummary { id: string; kind: ClipKind; preview: string; label: string; pinned: boolean; firstAt: number; lastAt: number; copies: number; bytes: number; hasHtml: boolean }
export interface ClipContent { text: string; html?: string; png?: string }
export interface ClipboardState {
  preferences: ClipboardPreferences
  paused: boolean
  blocked: 'vault' | 'screen' | null
  encryptionAvailable: boolean
  count: number
  bytes: number
  skipped: number
  error: string | null
}
export interface ClipboardApi {
  state(): Promise<ClipboardState>
  configure(value: ClipboardPreferences): Promise<ClipboardState>
  pause(value: boolean): Promise<ClipboardState>
  list(query?: string): Promise<ClipSummary[]>
  content(id: string): Promise<ClipContent>
  copy(id: string, mode: 'plain' | 'original', close?: boolean): Promise<void>
  copyText(text: string, close?: boolean): Promise<void>
  update(id: string, value: { pinned?: boolean; label?: string }): Promise<void>
  remove(ids: string[]): Promise<void>
  clear(): Promise<void>
  captureCurrent(): Promise<void>
  ocr(id: string): Promise<string | null>
  onChanged(callback: () => void): () => void
}

export function validateClipboardPreferences(value: unknown): ClipboardPreferences {
  const p = value as ClipboardPreferences | null
  if (!p || typeof p.enabled !== 'boolean' || typeof p.persist !== 'boolean' || !CLIP_RETENTION.includes(p.retentionDays) || !Number.isInteger(p.maxEntries) || p.maxEntries < 20 || p.maxEntries > 300 || !Array.isArray(p.excludeText) || p.excludeText.length > 20 || p.excludeText.some(text => typeof text !== 'string' || !text.trim() || text.length > 80)) throw new Error('Invalid clipboard preferences.')
  return { enabled: p.enabled, persist: p.persist, retentionDays: p.retentionDays, maxEntries: p.maxEntries, excludeText: p.excludeText.map(text => text.trim()) }
}
