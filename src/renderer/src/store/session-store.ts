import { create } from 'zustand'

export const NO_HISTORY_TOOLS = new Set([
  'text.clipboard',
  'hacking.stress', 'hacking.hash', 'hacking.headers', 'hacking.cors', 'hacking.jwt',
  'json.schema',
  'json.reconcile',
  'network.openapi',
  'text.logs',
  'security.env',
  'design.color',
  'text.ocr',
  'security.random',
  'security.keygen',
  'security.hash',
  'security.hmac',
  'security.jwt',
  'security.aes',
  'privatebox.home',
  'privatebox.keep',
  'network.ssh',
  'network.http',
  'network.mock-api',
  'network.local-domains',
  'network.url',
  'text.qr'
])

export interface HistoryEntry {
  toolId: string
  label: string
  snippet: string
  at: number
}

interface SessionState {
  retention: boolean
  setRetention: (enabled: boolean) => void
  history: HistoryEntry[]
  drafts: Record<string, string>
  pushHistory: (entry: Omit<HistoryEntry, 'at'>) => void
  clearHistory: () => void
  setDraft: (toolId: string, value: string) => void
  getDraft: (toolId: string) => string | undefined
  clearDraft: (toolId: string) => void
  clearDrafts: () => void
}

const MAX_HISTORY = 40
export const MAX_DRAFT_CHARS = 1024 * 1024
export const MAX_DRAFT_TOTAL_CHARS = 4 * MAX_DRAFT_CHARS
const validToolId = (id: string): boolean => /^[a-z0-9][a-z0-9.-]{0,127}$/i.test(id)

export const useSessionStore = create<SessionState>((set, get) => ({
  retention: true,
  setRetention: (retention) => set(retention ? { retention } : { retention, history: [], drafts: {} }),
  history: [],
  drafts: {},

  pushHistory: (entry) => {
    if (!get().retention || !validToolId(entry.toolId) || NO_HISTORY_TOOLS.has(entry.toolId)) return
    if (!entry.snippet.slice(0, 200).trim()) return
    set((s) => {
      const next: HistoryEntry = { ...entry, label: entry.label.slice(0, 100), snippet: entry.snippet.slice(0, 200), at: Date.now() }
      if (
        s.history[0] &&
        s.history[0].toolId === next.toolId &&
        s.history[0].snippet === next.snippet
      ) {
        return s
      }
      return { history: [next, ...s.history].slice(0, MAX_HISTORY) }
    })
  },

  clearHistory: () => set({ history: [] }),

  setDraft: (toolId, value) => {
    if (!get().retention || !validToolId(toolId) || NO_HISTORY_TOOLS.has(toolId)) return
    set((s) => {
      const drafts = { ...s.drafts }
      delete drafts[toolId]
      if (value.length <= MAX_DRAFT_CHARS) drafts[toolId] = value
      let total = Object.values(drafts).reduce((sum, text) => sum + text.length, 0)
      for (const id of Object.keys(drafts)) {
        if (total <= MAX_DRAFT_TOTAL_CHARS && Object.keys(drafts).length <= 40) break
        total -= drafts[id]!.length
        delete drafts[id]
      }
      return { drafts }
    })
  },

  getDraft: (toolId) => get().retention ? get().drafts[toolId] : undefined,
  clearDrafts: () => set({ drafts: {} }),

  clearDraft: (toolId) =>
    set((s) => {
      const drafts = { ...s.drafts }
      delete drafts[toolId]
      return { drafts }
    })
}))
