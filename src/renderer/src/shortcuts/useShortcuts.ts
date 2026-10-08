import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '@renderer/store/app-store'
import { formatShortcut, matchesShortcut, shortcutBinding, shortcutConflicts, shortcutProblem, type ShortcutKeyEvent, type ShortcutPlatform } from '@shared/shortcuts'
import { shortcutCommand, shortcutCommands } from './catalog'

export function currentShortcutPlatform(): ShortcutPlatform {
  return typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? 'darwin' : 'win32'
}
let platformRead: Promise<ShortcutPlatform> | undefined
export function useShortcutPlatform(): ShortcutPlatform {
  const [platform, setPlatform] = useState(currentShortcutPlatform)
  useEffect(() => {
    let live = true
    if (window.devutils?.platform) {
      platformRead ??= window.devutils.platform().then(value => value === 'darwin' || value === 'linux' ? value : 'win32').catch(currentShortcutPlatform)
      void platformRead.then(value => { if (live) setPlatform(value) })
    }
    return () => { live = false }
  }, [])
  return platform
}
export function shortcutLayerOwnsFocus(): boolean {
  return !!document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [data-shortcut-recording]') || document.documentElement.dataset.vaultMasked === 'true'
}
export function useShortcut(id: string): { binding: string | null; platform: ShortcutPlatform; enabled: boolean; matches: (event: ShortcutKeyEvent) => boolean } {
  const platform = useShortcutPlatform()
  const overrides = useAppStore(state => state.shortcutOverrides)
  const command = shortcutCommand(id)
  const binding = command ? shortcutBinding(command, overrides, platform) : null
  const usable = command && binding && !shortcutProblem(binding, command, platform) && !shortcutConflicts(command, binding, shortcutCommands, overrides, platform).length
  const matches = useCallback((event: ShortcutKeyEvent) => !!usable && !shortcutLayerOwnsFocus() && matchesShortcut(event, binding, platform), [usable, binding, platform])
  return { binding, platform, enabled: !!usable, matches }
}
export function useShortcutSet(): { label: (id: string) => string; matches: (id: string, event: ShortcutKeyEvent) => boolean } {
  const platform = useShortcutPlatform()
  const overrides = useAppStore(state => state.shortcutOverrides)
  return {
    label: id => { const command = shortcutCommand(id); return command ? formatShortcut(shortcutBinding(command, overrides, platform), platform) : '' },
    matches: (id, event) => {
      const command = shortcutCommand(id)
      if (!command || shortcutLayerOwnsFocus()) return false
      const binding = shortcutBinding(command, overrides, platform)
      return !!binding && !shortcutProblem(binding, command, platform) && !shortcutConflicts(command, binding, shortcutCommands, overrides, platform).length && matchesShortcut(event, binding, platform)
    }
  }
}
export function useToolShortcuts(actions: Record<string, () => void>, enabled = true): void {
  const platform = useShortcutPlatform()
  const overrides = useAppStore(state => state.shortcutOverrides)
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!enabled || event.defaultPrevented || shortcutLayerOwnsFocus()) return
      for (const [id, action] of Object.entries(actions)) {
        const command = shortcutCommand(id)
        if (!command) continue
        const binding = shortcutBinding(command, overrides, platform)
        if (binding && !shortcutProblem(binding, command, platform) && !shortcutConflicts(command, binding, shortcutCommands, overrides, platform).length && matchesShortcut(event, binding, platform)) {
          event.preventDefault(); action(); return
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [actions, enabled, overrides, platform])
}
export function useAppShortcuts(): string | null {
  const navigate = useNavigate()
  const platform = useShortcutPlatform()
  const overrides = useAppStore(state => state.shortcutOverrides)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || shortcutLayerOwnsFocus()) return
      const candidates = shortcutCommands.filter(command => command.scope === 'app' && matchesShortcut(event, shortcutBinding(command, overrides, platform), platform))
      if (candidates.length !== 1) return
      const command = candidates[0], binding = shortcutBinding(command, overrides, platform)!
      if (shortcutProblem(binding, command, platform) || shortcutConflicts(command, binding, shortcutCommands, overrides, platform).length) return
      const state = useAppStore.getState()
      event.preventDefault(); setError(null)
      if (command.id.startsWith('tool.')) navigate('/tool/' + command.id.slice(5))
      else if (command.id === 'app.palette') state.setCommandOpen(true)
      else if (command.id === 'app.home') navigate('/')
      else if (command.id === 'app.settings') navigate('/tool/app.settings')
      else if (command.id === 'app.sidebar') state.setSidebarCollapsed(!state.sidebarCollapsed)
      else if (command.id === 'app.theme') state.setTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark')
      else if (command.id === 'app.lock') {
        if (!window.devutils?.security?.lock) setError('Locking boxes requires the desktop app.')
        else void window.devutils.security.lock().catch(() => setError('The shortcut action failed. Try the action from its tool.'))
      }
    }
    // App navigation must run before editors consume a customized combination.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [navigate, overrides, platform])
  return error
}
