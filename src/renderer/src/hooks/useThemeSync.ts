import { useEffect, useState } from 'react'
import { isThemeState, type ThemeMode } from '@shared/theme'
import { useAppStore } from '../store/app-store'

export function useThemeSync(): string {
  const [error, setError] = useState('')
  useEffect(() => {
    const api = window.devutils?.app
    if (!api?.theme || !api.setTheme) return
    let live = true, initialized = false, applying = false, version = 0, pending = 0
    const save = async (theme: ThemeMode): Promise<void> => {
      pending++
      try { await api.setTheme(theme); if (live) setError('') }
      catch { if (live) setError('Theme could not be saved. Try again.') }
      finally { pending-- }
    }
    const off = useAppStore.subscribe((next, previous) => {
      if (next.theme !== previous.theme && !applying) { version++; if (initialized) void save(next.theme) }
    })
    const changed = api.onThemeChanged(state => {
      if (!live || !initialized || pending || !isThemeState(state)) return
      applying = true; useAppStore.getState().setTheme(state.theme); applying = false
    })
    void api.theme().then(async state => {
      if (!live || !isThemeState(state)) return
      initialized = true
      if (!state.configured || version) await save(useAppStore.getState().theme)
      else { applying = true; useAppStore.getState().setTheme(state.theme); applying = false }
    }).catch(() => { if (live) setError('Theme could not be loaded. Try again.') })
    return () => { live = false; off(); changed() }
  }, [])
  return error
}
