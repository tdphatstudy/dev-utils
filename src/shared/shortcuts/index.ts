export type ShortcutPlatform = 'win32' | 'darwin' | 'linux'
export type ShortcutScope = 'app' | 'editor' | 'vault' | 'color' | 'ocr'
export type ShortcutOverrides = Record<string, string | null>
export interface ShortcutCommand {
  id: string
  label: string
  group: 'App' | 'Tools' | 'In tools'
  scope: ShortcutScope
  defaultBinding: string | null
  macBinding?: string
}

export const APP_SHORTCUTS: readonly ShortcutCommand[] = [
  { id: 'app.palette', label: 'Open command palette', group: 'App', scope: 'app', defaultBinding: 'Mod+K' },
  { id: 'app.home', label: 'Go to Home', group: 'App', scope: 'app', defaultBinding: 'Mod+Shift+H' },
  { id: 'app.settings', label: 'Open Settings', group: 'App', scope: 'app', defaultBinding: 'Mod+,' },
  { id: 'app.sidebar', label: 'Toggle sidebar', group: 'App', scope: 'app', defaultBinding: 'Mod+Shift+B' },
  { id: 'app.theme', label: 'Toggle light / dark theme', group: 'App', scope: 'app', defaultBinding: 'Mod+Shift+L' },
  { id: 'app.lock', label: 'Lock all boxes', group: 'App', scope: 'app', defaultBinding: 'Mod+Shift+X' },
  { id: 'editor.run', label: 'Run in supported editors and HTTP requests', group: 'In tools', scope: 'editor', defaultBinding: 'Mod+Enter' },
  { id: 'vault.save', label: 'Save box document', group: 'In tools', scope: 'vault', defaultBinding: 'Mod+S' },
  { id: 'vault.new-text', label: 'New Text File', group: 'In tools', scope: 'vault', defaultBinding: 'Mod+N' },
  { id: 'vault.new-json', label: 'New JSON', group: 'In tools', scope: 'vault', defaultBinding: 'Mod+J' },
  { id: 'vault.new-folder', label: 'New Folder', group: 'In tools', scope: 'vault', defaultBinding: 'Mod+Shift+N' },
  { id: 'vault.rename', label: 'Rename selected box entry', group: 'In tools', scope: 'vault', defaultBinding: 'F2' },
  { id: 'vault.delete', label: 'Delete selected box entry', group: 'In tools', scope: 'vault', defaultBinding: 'Delete', macBinding: 'Mod+Backspace' },
  { id: 'vault.open', label: 'Open selected box entry', group: 'In tools', scope: 'vault', defaultBinding: 'Enter' },
  { id: 'color.pick', label: 'Pick screen color', group: 'In tools', scope: 'color', defaultBinding: 'Mod+Shift+C' },
  { id: 'ocr.region', label: 'Capture text from a screen region', group: 'In tools', scope: 'ocr', defaultBinding: 'Mod+Shift+A' },
  { id: 'ocr.screen', label: 'Capture text from the screen', group: 'In tools', scope: 'ocr', defaultBinding: null }
]

const modifiers = ['Mod', 'Ctrl', 'Meta', 'Alt', 'Shift'] as const
const keys = new Set(['Enter', 'Escape', 'Space', 'Backspace', 'Delete', 'Home', 'End', 'PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ',', '.', '/', ';', "'", '[', ']', '\\', '-', '=', '`'])
const aliases: Record<string, string> = { control: 'Ctrl', ctrl: 'Ctrl', command: 'Meta', cmd: 'Meta', meta: 'Meta', mod: 'Mod', alt: 'Alt', option: 'Alt', shift: 'Shift', esc: 'Escape', del: 'Delete', space: 'Space', return: 'Enter' }

export function normalizeShortcut(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 64) return null
  const parts = value.split('+').map(part => part.trim())
  if (!parts.length || parts.length > 5 || parts.some(part => !part)) return null
  const keyPart = parts.pop()!
  const key = aliases[keyPart.toLowerCase()] ?? [...keys].find(value => value.toLowerCase() === keyPart.toLowerCase()) ?? keyPart.toUpperCase()
  if (!keys.has(key) && !/^[A-Z0-9]$|^F(?:[1-9]|1[0-2])$/.test(key)) return null
  const mods = parts.map(part => aliases[part.toLowerCase()])
  if (mods.some(part => !modifiers.includes(part as typeof modifiers[number])) || new Set(mods).size !== mods.length || (mods.includes('Mod') && mods.includes('Meta'))) return null
  return [...modifiers.filter(mod => mods.includes(mod)), key].join('+')
}

export function isShortcutCommandId(value: string): boolean {
  return APP_SHORTCUTS.some(command => command.id === value) || /^tool\.[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/.test(value) && value.length <= 90
}
export function readShortcutOverrides(value: unknown): ShortcutOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).slice(0, 128).flatMap<[string, string | null]>(([id, binding]) => {
    if (!isShortcutCommandId(id)) return []
    if (binding === null) return [[id, null]]
    const normalized = normalizeShortcut(binding)
    return normalized ? [[id, normalized]] : []
  }))
}
export function shortcutBinding(command: ShortcutCommand, overrides: ShortcutOverrides, platform: ShortcutPlatform): string | null {
  return Object.hasOwn(overrides, command.id) ? overrides[command.id] : platform === 'darwin' && command.macBinding ? command.macBinding : command.defaultBinding
}
export function resolvedShortcut(binding: string, platform: ShortcutPlatform): string {
  const parts = binding.split('+').map(part => part === 'Mod' ? platform === 'darwin' ? 'Meta' : 'Ctrl' : part)
  const key = parts.pop()!
  return [...modifiers.filter(mod => parts.includes(mod)), key].join('+')
}
export function formatShortcut(binding: string | null, platform: ShortcutPlatform): string {
  if (!binding) return ''
  return resolvedShortcut(binding, platform).split('+').map(part => platform === 'darwin' ? ({ Meta: '⌘', Ctrl: '⌃', Alt: '⌥', Shift: '⇧' }[part] ?? part) : part).join('+')
}
export function shortcutAria(binding: string | null, platform: ShortcutPlatform): string | undefined {
  return binding ? resolvedShortcut(binding, platform).replace(/Ctrl/g, 'Control') : undefined
}

export interface ShortcutKeyEvent {
  key: string; code?: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean
  repeat?: boolean; isComposing?: boolean; getModifierState?: (key: string) => boolean
}
const codeKeys: Record<string, string> = { Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`', Space: 'Space' }
export function shortcutFromEvent(event: ShortcutKeyEvent, platform: ShortcutPlatform): string | null {
  if (event.isComposing || event.key === 'Dead' || event.key === 'Process' || event.getModifierState?.('AltGraph')) return null
  const key = event.code?.match(/^(?:Key|Digit)([A-Z0-9])$/)?.[1] ?? codeKeys[event.code ?? ''] ?? (event.key === ' ' ? 'Space' : event.key)
  const mods: string[] = []
  if (platform === 'darwin' ? event.metaKey : event.ctrlKey) mods.push('Mod')
  if (platform === 'darwin' && event.ctrlKey) mods.push('Ctrl')
  if (platform !== 'darwin' && event.metaKey) mods.push('Meta')
  if (event.altKey) mods.push('Alt')
  if (event.shiftKey) mods.push('Shift')
  return normalizeShortcut([...mods, key].join('+'))
}
export function matchesShortcut(event: ShortcutKeyEvent, binding: string | null, platform: ShortcutPlatform): boolean {
  if (!binding || event.repeat || event.isComposing) return false
  const actual = shortcutFromEvent(event, platform)
  return !!actual && resolvedShortcut(actual, platform) === resolvedShortcut(binding, platform)
}
export function scopesOverlap(first: ShortcutScope, second: ShortcutScope): boolean {
  return first === 'app' || second === 'app' || first === second || first === 'editor' && second === 'vault' || first === 'vault' && second === 'editor'
}
export function sameShortcutCommands(binding: string, commands: readonly ShortcutCommand[], overrides: ShortcutOverrides, platform: ShortcutPlatform): ShortcutCommand[] {
  return commands.filter(command => {
    const current = shortcutBinding(command, overrides, platform)
    return !!current && resolvedShortcut(current, platform) === resolvedShortcut(binding, platform)
  })
}
export function shortcutConflicts(command: ShortcutCommand, binding: string, commands: readonly ShortcutCommand[], overrides: ShortcutOverrides, platform: ShortcutPlatform): ShortcutCommand[] {
  return sameShortcutCommands(binding, commands, overrides, platform).filter(other => other.id !== command.id && scopesOverlap(command.scope, other.scope))
}
export function shortcutProblem(binding: string, command: ShortcutCommand | null, platform: ShortcutPlatform): string | null {
  const normalized = normalizeShortcut(binding)
  if (!normalized) return 'Choose a valid key combination.'
  const resolved = resolvedShortcut(normalized, platform)
  const primary = platform === 'darwin' ? 'Meta' : 'Ctrl'
  const reserved = [`${primary}+C`, `${primary}+V`, `${primary}+X`, `${primary}+A`, `${primary}+Z`, `${primary}+Y`, `${primary}+Shift+Z`, `${primary}+F`, `${primary}+G`, `${primary}+Shift+G`, `${primary}+D`, `${primary}+Q`, `${primary}+W`, `${primary}+R`, `${primary}+Shift+R`, `${primary}+Shift+I`, `${primary}+=`, `${primary}+Shift+=`, `${primary}+-`, `${primary}+0`, 'Alt+F4', 'Alt+Space', 'Ctrl+Escape', 'Ctrl+Shift+Escape', 'F5', 'F11', 'Meta+Alt+I', 'Meta+H', 'Meta+Alt+H', 'Meta+M', 'Meta+Space', 'Ctrl+Alt+Delete']
  if (reserved.includes(resolved) || platform !== 'darwin' && resolved.includes('Meta+')) return 'This combination is reserved for system, menu or text editing commands.'
  const key = normalized.split('+').at(-1)!
  const hasModifier = normalized.split('+').slice(0, -1).some(mod => mod !== 'Shift')
  if (command && !hasModifier && !(command.scope === 'vault' && ['Enter', 'Delete', 'F2'].includes(key)) && !/^F(?:[1-9]|1[0-2])$/.test(key)) return 'Include Ctrl, Command or Alt so typing and navigation keep working.'
  return null
}
