import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { isPreferenceToolId, MAX_FAVORITE_TOOLS, MAX_RECENT_TOOLS, readAppPreferences, type ToolLoadingMode, type SurfaceMode, type MotionMode, type InputRetention } from './app-preferences'
import { useSessionStore } from './session-store'
import { isLanguage, isLocale, type LanguageSetting, type LocaleId } from '@shared/i18n/locales'

export type { ToolLoadingMode } from './app-preferences'

export type ThemeMode = 'dark' | 'light' | 'system'

/** Where to land when the app starts at `/`. */
export type LaunchMode = 'home' | 'last'

interface AppState {
  language: LanguageSetting
  systemLocale: LocaleId | null
  setLanguage: (language: LanguageSetting) => void
  setSystemLocale: (locale: LocaleId) => void
  theme: ThemeMode
  surfaceMode: SurfaceMode
  motionMode: MotionMode
  inputRetention: InputRetention
  setInputRetention: (mode: InputRetention) => void
  setSurfaceMode: (mode: SurfaceMode) => void
  setMotionMode: (mode: MotionMode) => void
  sidebarCollapsed: boolean
  /** Last opened tool (for "resume last tool" launch mode). */
  lastToolId: string | null
  /** Recently used tools (Home shortcuts). Most recent first. */
  recentToolIds: string[]
  /** Pinned tool IDs only, never inputs or document content. */
  favoriteToolIds: string[]
  toggleFavoriteTool: (id: string) => void
  /**
   * On launch at Home route:
   * - `home` — show dashboard (recommended default)
   * - `last` — jump straight to last tool
   */
  launchMode: LaunchMode
  toolLoadingMode: ToolLoadingMode
  /**
   * Custom SSH directory (keys). null = platform default (`$HOME/.ssh`).
   */
  sshDir: string | null
  /**
   * Custom ssh_config path when not `$sshDir/config`. null = default.
   */
  sshConfigPath: string | null
  setTheme: (theme: ThemeMode) => void
  setSidebarCollapsed: (v: boolean) => void
  setLastToolId: (id: string) => void
  setLaunchMode: (mode: LaunchMode) => void
  setToolLoadingMode: (mode: ToolLoadingMode) => void
  setSshDir: (path: string | null) => void
  setSshConfigPath: (path: string | null) => void
  commandOpen: boolean
  setCommandOpen: (v: boolean) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      language: 'system',
      systemLocale: null,
      setLanguage: language => { if (isLanguage(language)) set({ language }) },
      setSystemLocale: systemLocale => { if (isLocale(systemLocale)) set({ systemLocale }) },
      theme: 'dark',
      surfaceMode: 'glass',
      motionMode: 'system',
      inputRetention: 'session',
      setInputRetention: (inputRetention) => {
        if (inputRetention !== 'session' && inputRetention !== 'off') return
        useSessionStore.getState().setRetention(inputRetention === 'session')
        set({ inputRetention })
      },
      setSurfaceMode: (surfaceMode) => set({ surfaceMode }),
      setMotionMode: (motionMode) => set({ motionMode }),
      sidebarCollapsed: false,
      lastToolId: null,
      recentToolIds: [],
      favoriteToolIds: [],
      launchMode: 'home',
      toolLoadingMode: 'on-demand',
      sshDir: null,
      sshConfigPath: null,
      commandOpen: false,
      setTheme: (theme) => set({ theme }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setLastToolId: (lastToolId) =>
        set((s) => {
          if (!isPreferenceToolId(lastToolId)) return s
          const recentToolIds = [
            lastToolId,
            ...s.recentToolIds.filter((id) => id !== lastToolId)
          ].slice(0, MAX_RECENT_TOOLS)
          return { lastToolId, recentToolIds }
        }),
      toggleFavoriteTool: (id) => {
        if (!isPreferenceToolId(id)) return
        set((s) => ({
          favoriteToolIds: s.favoriteToolIds.includes(id)
            ? s.favoriteToolIds.filter((toolId) => toolId !== id)
            : s.favoriteToolIds.length < MAX_FAVORITE_TOOLS
              ? [...s.favoriteToolIds, id]
              : s.favoriteToolIds
        }))
      },
      setLaunchMode: (launchMode) => set({ launchMode }),
      setToolLoadingMode: (toolLoadingMode) => set({ toolLoadingMode }),
      setSshDir: (sshDir) => set({ sshDir }),
      setSshConfigPath: (sshConfigPath) => set({ sshConfigPath }),
      setCommandOpen: (commandOpen) => set({ commandOpen })
    }),
    {
      name: 'devutils-app',
      merge: (persisted, current) => {
        const next = { ...current, ...readAppPreferences(persisted) }
        useSessionStore.getState().setRetention(next.inputRetention === 'session')
        return next
      },
      partialize: (s) => ({
        language: s.language,
        theme: s.theme,
        surfaceMode: s.surfaceMode,
        motionMode: s.motionMode,
        inputRetention: s.inputRetention,
        sidebarCollapsed: s.sidebarCollapsed,
        lastToolId: s.lastToolId,
        recentToolIds: s.recentToolIds,
        favoriteToolIds: s.favoriteToolIds,
        launchMode: s.launchMode,
        toolLoadingMode: s.toolLoadingMode,
        sshDir: s.sshDir,
        sshConfigPath: s.sshConfigPath
      })
    }
  )
)
