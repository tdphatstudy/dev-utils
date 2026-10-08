import { describe, expect, it } from 'vitest'
import { APP_SHORTCUTS, formatShortcut, matchesShortcut, normalizeShortcut, readShortcutOverrides, resolvedShortcut, sameShortcutCommands, scopesOverlap, shortcutAria, shortcutBinding, shortcutConflicts, shortcutFromEvent, shortcutProblem, type ShortcutCommand, type ShortcutKeyEvent } from './index'

const command = (id: string): ShortcutCommand => APP_SHORTCUTS.find(command => command.id === id)!
const key = (values: Partial<ShortcutKeyEvent> = {}): ShortcutKeyEvent => ({ key: 'k', code: 'KeyK', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, ...values })

describe('shortcut input and persisted metadata', () => {
  it('canonicalizes aliases and modifier order without accepting malformed or arbitrary input', () => {
    expect(normalizeShortcut(' shift + control + k ')).toBe('Ctrl+Shift+K')
    expect(normalizeShortcut('option+Command+return')).toBe('Meta+Alt+Enter')
    expect(normalizeShortcut('mod+,')).toBe('Mod+,')
    for (const value of [null, {}, ['Ctrl+K'], '', 'Ctrl++K', 'Ctrl+Ctrl+K', 'Ctrl+', 'Ctrl+Shift', 'Mod+Meta+K', 'Ctrl+payload', 'Ctrl+F13', 'constructor', 'Meta+K'.repeat(20)]) expect(normalizeShortcut(value)).toBeNull()
  })
  it('retains only bounded command bindings and explicit disables; old preferences need no migration', () => {
    expect(readShortcutOverrides({ 'app.palette': 'ctrl+shift+p', 'vault.save': null, 'tool.future.utility': 'Alt+9', '__proto__': 'Ctrl+K', content: 'secret', 'app.unknown': 'Ctrl+8', 'app.theme': { password: 'secret' }, 'editor.run': 'Ctrl++K' })).toEqual({ 'app.palette': 'Ctrl+Shift+P', 'vault.save': null, 'tool.future.utility': 'Alt+9' })
    for (const value of [null, [], false, 'Ctrl+K']) expect(readShortcutOverrides(value)).toEqual({})
    expect(Object.keys(readShortcutOverrides(Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`tool.fixture.tool${i}`, 'Alt+9']))))).toHaveLength(128)
    expect(shortcutBinding(command('app.palette'), {}, 'linux')).toBe('Mod+K')
    expect(shortcutBinding(command('app.palette'), { 'app.palette': null }, 'win32')).toBeNull()
    expect(shortcutBinding(command('vault.delete'), {}, 'darwin')).toBe('Mod+Backspace')
  })
})

describe('physical key matching across platforms', () => {
  it('resolves the primary modifier per platform, including equivalent duplicate aliases', () => {
    expect(resolvedShortcut('Mod+Ctrl+K', 'win32')).toBe('Ctrl+K')
    expect(resolvedShortcut('Mod+Ctrl+K', 'darwin')).toBe('Ctrl+Meta+K')
    expect(formatShortcut('Mod+Shift+1', 'win32')).toBe('Ctrl+Shift+1')
    expect(formatShortcut('Mod+Shift+1', 'darwin')).toBe('⌘+⇧+1')
    expect(shortcutAria('Mod+Enter', 'win32')).toBe('Control+Enter')
    expect(formatShortcut(null, 'linux')).toBe('')
    expect(matchesShortcut(key(), 'Mod+K', 'win32')).toBe(true)
    expect(matchesShortcut(key(), 'Mod+K', 'darwin')).toBe(false)
    expect(matchesShortcut(key({ ctrlKey: false, metaKey: true }), 'Mod+K', 'darwin')).toBe(true)
    expect(matchesShortcut(key({ shiftKey: true }), 'Mod+K', 'win32')).toBe(false)
    expect(matchesShortcut(key({ altKey: true }), 'Mod+K', 'win32')).toBe(false)
  })
  it('records shifted digits and punctuation by physical key rather than produced symbol', () => {
    expect(shortcutFromEvent(key({ key: '!', code: 'Digit1', shiftKey: true }), 'win32')).toBe('Mod+Shift+1')
    expect(shortcutFromEvent(key({ key: '<', code: 'Comma', shiftKey: true }), 'darwin')).toBe('Ctrl+Shift+,')
    expect(shortcutFromEvent(key({ key: 'F2', code: 'F2', ctrlKey: false }), 'win32')).toBe('F2')
    expect(shortcutFromEvent(key({ key: 'Control', code: 'ControlLeft' }), 'win32')).toBeNull()
  })
  it('never executes repeated, composing, dead-key or AltGr events', () => {
    for (const values of [{ repeat: true }, { isComposing: true }, { key: 'Dead' }, { key: 'Process' }, { getModifierState: (modifier: string) => modifier === 'AltGraph' }]) expect(matchesShortcut(key(values), 'Mod+K', 'win32')).toBe(false)
    expect(matchesShortcut(key(), null, 'win32')).toBe(false)
  })
})

describe('context conflicts and reserved keys', () => {
  it('finds alias collisions, excludes self, and allows separate tool contexts', () => {
    const overrides = { 'app.home': 'Ctrl+K', 'ocr.region': 'Mod+Shift+C', 'vault.save': 'Mod+Enter' }
    expect(shortcutConflicts(command('app.palette'), 'Mod+K', APP_SHORTCUTS, overrides, 'win32').map(command => command.id)).toEqual(['app.home'])
    expect(shortcutConflicts(command('app.palette'), 'Mod+K', APP_SHORTCUTS, overrides, 'darwin')).toEqual([])
    expect(sameShortcutCommands('Ctrl+Shift+C', APP_SHORTCUTS, overrides, 'win32').map(command => command.id)).toEqual(['color.pick', 'ocr.region'])
    expect(shortcutConflicts(command('color.pick'), 'Mod+Shift+C', APP_SHORTCUTS, overrides, 'win32')).toEqual([])
    expect(shortcutConflicts(command('editor.run'), 'Mod+Enter', APP_SHORTCUTS, overrides, 'win32').map(command => command.id)).toEqual(['vault.save'])
    expect(scopesOverlap('app', 'ocr')).toBe(true)
    expect(scopesOverlap('editor', 'vault')).toBe(true)
    expect(scopesOverlap('color', 'ocr')).toBe(false)
  })
  it.each(['win32', 'darwin', 'linux'] as const)('keeps every default usable and conflict-free on %s', platform => {
    for (const item of APP_SHORTCUTS) {
      const binding = shortcutBinding(item, {}, platform)
      if (!binding) continue
      expect(shortcutProblem(binding, item, platform), item.id).toBeNull()
      expect(shortcutConflicts(item, binding, APP_SHORTCUTS, {}, platform), item.id).toEqual([])
    }
  })
  it('protects editing/navigation and known native or system commands', () => {
    for (const binding of ['Mod+C', 'Mod+Shift+Z', 'Alt+F4', 'Ctrl+Shift+Escape', 'F5', 'Ctrl+Alt+Delete']) expect(shortcutProblem(binding, command('app.home'), 'win32')).toMatch(/reserved/)
    expect(shortcutProblem('Meta+Shift+8', command('app.home'), 'win32')).toMatch(/reserved/)
    expect(shortcutProblem('Cmd+H', command('app.home'), 'darwin')).toMatch(/reserved/)
    for (const binding of ['K', 'Enter', 'Shift+ArrowDown']) expect(shortcutProblem(binding, command('app.home'), 'win32')).toMatch(/Include/)
    expect(shortcutProblem('Enter', command('vault.open'), 'win32')).toBeNull()
    expect(shortcutProblem('Enter', null, 'win32')).toBeNull()
    expect(shortcutProblem('Ctrl++K', null, 'win32')).toMatch(/valid/)
  })
})
