import { beforeEach, describe, expect, it } from 'vitest'
import { NO_HISTORY_TOOLS, useSessionStore } from '../src/renderer/src/store/session-store'

beforeEach(() => useSessionStore.setState({ history: [], drafts: {} }))

describe('session privacy and history', () => {
  it.each([...NO_HISTORY_TOOLS])('never keeps payloads from %s in drafts or history', (toolId) => {
    useSessionStore.getState().setDraft(toolId, 'private-data')
    useSessionStore.getState().pushHistory({ toolId, label: toolId, snippet: 'private-data' })
    expect(useSessionStore.getState().drafts).toEqual({})
    expect(useSessionStore.getState().history).toEqual([])
  })
  it('retains ordinary drafts including explicit clearing', () => {
    useSessionStore.getState().setDraft('json.studio', '{"a":1}')
    expect(useSessionStore.getState().getDraft('json.studio')).toBe('{"a":1}')
    useSessionStore.getState().setDraft('json.studio', '')
    expect(useSessionStore.getState().getDraft('json.studio')).toBe('')
  })
  it('deduplicates repeated history and bounds it to 40 entries', () => {
    for (let i = 0; i < 45; i++) {
      const entry = { toolId: 'json.studio', label: 'JSON', snippet: String(i) }
      useSessionStore.getState().pushHistory(entry)
      useSessionStore.getState().pushHistory(entry)
    }
    expect(useSessionStore.getState().history).toHaveLength(40)
    expect(useSessionStore.getState().history[0]?.snippet).toBe('44')
  })
})
