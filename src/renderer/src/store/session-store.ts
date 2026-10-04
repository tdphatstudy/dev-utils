import { create } from 'zustand'

export const NO_HISTORY_TOOLS = new Set([
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
  'network.url'
])

export interface HistoryEntry {
  toolId: string
  label: string
  snippet: string
  at: number
}

interface SessionState {
  history: HistoryEntry[]
  drafts: Record<string, string>
  pushHistory: (entry: Omit<HistoryEntry, 'at'>) => void
  clearHistory: () => void
  setDraft: (toolId: string, value: string) => void
  getDraft: (toolId: string) => string | undefined
  clearDraft: (toolId: string) => void
}

const MAX_HISTORY = 40

export const useSessionStore = create<SessionState>((set, get) => ({
  history: [],
  drafts: {},

  pushHistory: (entry) => {
    if (NO_HISTORY_TOOLS.has(entry.toolId)) return
    if (!entry.snippet.trim()) return
    set((s) => {
      const next: HistoryEntry = { ...entry, at: Date.now() }
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
    if (NO_HISTORY_TOOLS.has(toolId)) return
    set((s) => ({ drafts: { ...s.drafts, [toolId]: value } }))
  },

  getDraft: (toolId) => get().drafts[toolId],

  clearDraft: (toolId) =>
    set((s) => {
      const drafts = { ...s.drafts }
      delete drafts[toolId]
      return { drafts }
    })
}))
