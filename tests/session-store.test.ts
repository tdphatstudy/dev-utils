import { beforeEach, describe, expect, it } from 'vitest'
import { MAX_DRAFT_CHARS, MAX_DRAFT_TOTAL_CHARS, NO_HISTORY_TOOLS, useSessionStore } from '../src/renderer/src/store/session-store'

beforeEach(() => useSessionStore.setState({ history: [], drafts: {}, retention: true }))

describe('session privacy and history', () => {
  it('bounds retained draft memory and never restores an older draft after an oversized replacement', () => {
    const store = useSessionStore.getState()
    for (let i = 0; i < 20; i++) store.setDraft(`fixture.${i}`, String(i).padEnd(MAX_DRAFT_CHARS, 'x'))
    const drafts = useSessionStore.getState().drafts
    expect(Object.values(drafts).reduce((sum, value) => sum + value.length, 0)).toBeLessThanOrEqual(MAX_DRAFT_TOTAL_CHARS)
    expect(store.getDraft('fixture.19')).toBeDefined()
    store.setDraft('fixture.19', 'x'.repeat(MAX_DRAFT_CHARS + 1))
    expect(store.getDraft('fixture.19')).toBeUndefined()
  })
  it('bounds even direct history writes and the number of small drafts', () => {
    const store = useSessionStore.getState()
    store.pushHistory({ toolId: 'json.studio', label: 'x'.repeat(1000), snippet: 'x'.repeat(1_000_000) })
    expect(useSessionStore.getState().history[0]).toMatchObject({ label: 'x'.repeat(100), snippet: 'x'.repeat(200) })
    for (let i = 0; i < 100; i++) store.setDraft(`fixture.${i}`, 'x')
    expect(Object.keys(useSessionStore.getState().drafts)).toHaveLength(40)
  })
  it('clears retained content and rejects delayed writes while retention is off', () => {
    const store = useSessionStore.getState()
    store.setDraft('json.studio', 'private-input')
    store.pushHistory({ toolId: 'json.studio', label: 'JSON', snippet: 'private-input' })
    store.setRetention(false)
    store.setDraft('json.studio', 'delayed-flush')
    store.pushHistory({ toolId: 'json.studio', label: 'JSON', snippet: 'delayed-flush' })
    expect(useSessionStore.getState().drafts).toEqual({})
    expect(useSessionStore.getState().history).toEqual([])
    store.setRetention(true)
    expect(store.getDraft('json.studio')).toBeUndefined()
  })
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
  it('clears cached inputs and history independently', () => {
    const store = useSessionStore.getState()
    store.setDraft('json.studio', '{"private":"input"}')
    store.setDraft('yaml.studio', 'input: text')
    store.pushHistory({ toolId: 'json.studio', label: 'JSON', snippet: '{"private":"input"}' })
    store.clearDrafts()
    expect(useSessionStore.getState().drafts).toEqual({})
    expect(useSessionStore.getState().history).toHaveLength(1)
    store.setDraft('json.studio', 'new draft')
    store.clearHistory()
    expect(useSessionStore.getState().history).toEqual([])
    expect(useSessionStore.getState().drafts).toEqual({ 'json.studio': 'new draft' })
  })
})
