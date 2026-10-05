import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createJSONStorage } from 'zustand/middleware'
import { MAX_FAVORITE_TOOLS, readAppPreferences } from '../src/renderer/src/store/app-preferences'

let saved = ''
const storage = { getItem: () => saved || null, setItem: (_key: string, value: string) => { saved = value }, removeItem: () => { saved = '' } }
vi.stubGlobal('localStorage', storage)
vi.stubGlobal('window', { localStorage: storage })
// Node has no browser storage. Install the fixture before creating the store.
const { useAppStore } = await import('../src/renderer/src/store/app-store')
afterAll(() => vi.unstubAllGlobals())

describe('app preference compatibility and privacy', () => {
  it('preserves existing preferences without requiring a storage migration', () => {
    const oldPreferences = { theme: 'light', sidebarCollapsed: true, lastToolId: 'json.studio', recentToolIds: ['json.studio', 'privatebox.keep'], launchMode: 'last', sshDir: 'C:\\fixture\\.ssh', sshConfigPath: 'C:\\fixture\\config' }
    expect(readAppPreferences(oldPreferences)).toEqual(oldPreferences)
    expect(readAppPreferences(oldPreferences)).not.toHaveProperty('favoriteToolIds')
  })

  it('rejects malformed fields and ignores actions, arbitrary settings and content', () => {
    expect(readAppPreferences({ theme: 'purple', sidebarCollapsed: 'false', lastToolId: { secret: 'payload' }, recentToolIds: 'json.studio', favoriteToolIds: [null, {}, 'private text', 'json.studio', 'json.studio', 'text.ocr'], launchMode: 'other', sshDir: '\0', sshConfigPath: 7, setTheme: 'replaced', commandOpen: true, drafts: { 'text.ocr': 'secret text' } })).toEqual({ favoriteToolIds: ['json.studio', 'text.ocr'] })
    for (const invalid of [null, false, 'preferences', [], 42]) expect(readAppPreferences(invalid)).toEqual({})
  })

  it('deduplicates and caps tool lists while permitting future valid tool IDs', () => {
    const ids = Array.from({ length: 30 }, (_, index) => `text.fixture${index}`)
    const prefs = readAppPreferences({ favoriteToolIds: ids, recentToolIds: ids })
    expect(prefs.favoriteToolIds).toEqual(ids.slice(0, MAX_FAVORITE_TOOLS))
    expect(prefs.recentToolIds).toEqual(ids.slice(0, 10))
  })
})

describe('favorite tool preferences', () => {
  beforeEach(() => {
    saved = ''
    useAppStore.persist.setOptions({ storage: createJSONStorage(() => storage) })
    useAppStore.setState({ theme: 'dark', sidebarCollapsed: false, lastToolId: null, recentToolIds: [], favoriteToolIds: [], launchMode: 'home', sshDir: null, sshConfigPath: null, commandOpen: false })
  })

  it('persists only preference metadata and leaves transient state and actions out', () => {
    useAppStore.getState().toggleFavoriteTool('text.ocr')
    useAppStore.getState().setCommandOpen(true)
    const persisted = JSON.parse(saved).state
    expect(persisted.favoriteToolIds).toEqual(['text.ocr'])
    expect(Object.keys(persisted).sort()).toEqual(['favoriteToolIds', 'lastToolId', 'launchMode', 'recentToolIds', 'sidebarCollapsed', 'sshConfigPath', 'sshDir', 'theme'].sort())
    expect(persisted).not.toHaveProperty('commandOpen')
  })

  it('retains callable actions after hydrating untrusted persisted metadata', async () => {
    saved = JSON.stringify({ state: { theme: 'light', setTheme: 'replaced', toggleFavoriteTool: null, commandOpen: true, favoriteToolIds: 'bad value', recentToolIds: [null, 'json.studio'] }, version: 0 })
    await useAppStore.persist.rehydrate()
    expect(useAppStore.getState().theme).toBe('light')
    expect(useAppStore.getState().favoriteToolIds).toEqual([])
    expect(useAppStore.getState().recentToolIds).toEqual(['json.studio'])
    expect(useAppStore.getState().commandOpen).toBe(false)
    useAppStore.getState().toggleFavoriteTool('json.studio')
    expect(useAppStore.getState().favoriteToolIds).toEqual(['json.studio'])
    useAppStore.getState().setTheme('dark')
    expect(useAppStore.getState().theme).toBe('dark')
  })

  it('toggles favorite IDs, rejects payloads and requires room before adding', () => {
    const { toggleFavoriteTool } = useAppStore.getState()
    toggleFavoriteTool('json.studio')
    toggleFavoriteTool('json.studio')
    toggleFavoriteTool('{"private":"text"}')
    expect(useAppStore.getState().favoriteToolIds).toEqual([])
    for (let index = 0; index < 20; index++) toggleFavoriteTool(`text.fixture${index}`)
    expect(useAppStore.getState().favoriteToolIds).toHaveLength(MAX_FAVORITE_TOOLS)
    toggleFavoriteTool('text.fixture0')
    toggleFavoriteTool('design.color')
    expect(useAppStore.getState().favoriteToolIds).toContain('design.color')
    expect(useAppStore.getState().favoriteToolIds).not.toContain('text.fixture0')
  })
})
