import { useEffect, useRef } from 'react'
import { NO_HISTORY_TOOLS, useSessionStore } from '@renderer/store/session-store'

export function useToolDraft(
  toolId: string,
  value: string,
  setValue: (v: string) => void,
  options?: { label?: string; historyOnUnmount?: boolean }
): void {
  const setDraft = useSessionStore((s) => s.setDraft)
  const getDraft = useSessionStore((s) => s.getDraft)
  const pushHistory = useSessionStore((s) => s.pushHistory)
  const restored = useRef(false)

  useEffect(() => {
    if (NO_HISTORY_TOOLS.has(toolId) || restored.current) return
    const draft = getDraft(toolId)
    if (draft != null && draft !== value) {
      setValue(draft)
    }
    restored.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolId])

  useEffect(() => {
    if (NO_HISTORY_TOOLS.has(toolId)) return
    const t = window.setTimeout(() => setDraft(toolId, value), 400)
    return () => window.clearTimeout(t)
  }, [toolId, value, setDraft])

  useEffect(() => {
    if (!options?.historyOnUnmount || NO_HISTORY_TOOLS.has(toolId)) return
    return () => {
      if (value.trim()) {
        pushHistory({
          toolId,
          label: options.label ?? toolId,
          snippet: value.slice(0, 200)
        })
      }
    }
  }, [toolId, value, pushHistory, options?.historyOnUnmount, options?.label])
}
