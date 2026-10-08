import { tools } from '@renderer/registry/tools'
import { APP_SHORTCUTS, type ShortcutCommand } from '@shared/shortcuts'

const quickDefaults: Record<string, string> = { 'json.studio': 'Mod+Shift+1', 'network.http': 'Mod+Shift+2', 'privatebox.keep': 'Mod+Shift+3', 'text.ocr': 'Mod+Shift+4', 'design.color': 'Mod+Shift+5' }
// Tool metadata only: this never mounts tools or invokes their lazy loaders.
export const shortcutCommands: readonly ShortcutCommand[] = [...APP_SHORTCUTS, ...tools.filter(tool => tool.id !== 'app.settings').map(tool => ({ id: 'tool.' + tool.id, label: tool.name, group: 'Tools' as const, scope: 'app' as const, defaultBinding: quickDefaults[tool.id] ?? null }))]
export function shortcutCommand(id: string): ShortcutCommand | undefined { return shortcutCommands.find(command => command.id === id) }
