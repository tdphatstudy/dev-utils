import { useEffect, useRef } from 'react'
import { NO_HISTORY_TOOLS, useSessionStore } from '@renderer/store/session-store'

const DRAFT_DEBOUNCE_MS = 400
const HISTORY_SNIPPET_MAX = 200

export function useToolDraft(
  toolId: string,
  value: string,
  setValue: (v: string) => void,
  options?: { label?: string; historyOnUnmount?: boolean }
): void {
  const setDraft = useSessionStore((s) => s.setDraft)
  const retention = useSessionStore((s) => s.retention)
  const getDraft = useSessionStore((s) => s.getDraft)
  const pushHistory = useSessionStore((s) => s.pushHistory)
  const restored = useRef<string | null>(null)
  const snapshots = useRef(new Map<string, { value: string; label: string; history: boolean }>())
  const pendingFlush = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  if (retention && !NO_HISTORY_TOOLS.has(toolId)) snapshots.current.set(toolId, { value, label: options?.label ?? toolId, history: !!options?.historyOnUnmount })
  else snapshots.current.clear()

  useEffect(() => {
    if (!retention || NO_HISTORY_TOOLS.has(toolId) || restored.current === toolId) return
    const draft = getDraft(toolId)
    if (draft != null && draft !== value) {
      setValue(draft)
    }
    restored.current = toolId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolId, retention])

  useEffect(() => {
    if (!retention || NO_HISTORY_TOOLS.has(toolId)) return
    const t = window.setTimeout(() => setDraft(toolId, value), DRAFT_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [toolId, value, setDraft, retention])

  useEffect(() => {
    if (!retention || NO_HISTORY_TOOLS.has(toolId)) {
      for (const timer of pendingFlush.current.values()) clearTimeout(timer)
      pendingFlush.current.clear()
      return
    }
    const pending = pendingFlush.current.get(toolId)
    if (pending) clearTimeout(pending)
    return () => {
      const snapshot = snapshots.current.get(toolId)
      if (!snapshot) return
      // Cancelled by StrictMode's immediate setup; a real unmount flushes once.
      pendingFlush.current.set(toolId, setTimeout(() => {
        setDraft(toolId, snapshot.value)
        if (snapshot.history && snapshot.value.trim()) {
          pushHistory({ toolId, label: snapshot.label, snippet: snapshot.value.slice(0, HISTORY_SNIPPET_MAX) })
        }
        pendingFlush.current.delete(toolId)
      }, 0))
    }
  }, [toolId, setDraft, pushHistory, retention])
}
