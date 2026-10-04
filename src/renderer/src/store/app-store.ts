import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'dark' | 'light' | 'system'

/** Where to land when the app starts at `/`. */
export type LaunchMode = 'home' | 'last'

const MAX_RECENT = 10

interface AppState {
  theme: ThemeMode
  sidebarCollapsed: boolean
  /** Last opened tool (for "resume last tool" launch mode). */
  lastToolId: string | null
  /** Recently used tools (Home shortcuts). Most recent first. */
  recentToolIds: string[]
  /**
   * On launch at Home route:
   * - `home` — show dashboard (recommended default)
   * - `last` — jump straight to last tool
   */
  launchMode: LaunchMode
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
  setSshDir: (path: string | null) => void
  setSshConfigPath: (path: string | null) => void
  commandOpen: boolean
  setCommandOpen: (v: boolean) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      theme: 'dark',
      sidebarCollapsed: false,
      lastToolId: null,
      recentToolIds: [],
      launchMode: 'home',
      sshDir: null,
      sshConfigPath: null,
      commandOpen: false,
      setTheme: (theme) => set({ theme }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setLastToolId: (lastToolId) =>
        set((s) => {
          const recentToolIds = [
            lastToolId,
            ...s.recentToolIds.filter((id) => id !== lastToolId)
          ].slice(0, MAX_RECENT)
          return { lastToolId, recentToolIds }
        }),
      setLaunchMode: (launchMode) => set({ launchMode }),
      setSshDir: (sshDir) => set({ sshDir }),
      setSshConfigPath: (sshConfigPath) => set({ sshConfigPath }),
      setCommandOpen: (commandOpen) => set({ commandOpen })
    }),
    {
      name: 'devutils-app',
      partialize: (s) => ({
        theme: s.theme,
        sidebarCollapsed: s.sidebarCollapsed,
        lastToolId: s.lastToolId,
        recentToolIds: s.recentToolIds,
        launchMode: s.launchMode,
        sshDir: s.sshDir,
        sshConfigPath: s.sshConfigPath
      })
    }
  )
)
