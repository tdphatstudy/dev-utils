import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'dark' | 'light' | 'system'

interface AppState {
  theme: ThemeMode
  sidebarCollapsed: boolean
  lastToolId: string | null
  setTheme: (theme: ThemeMode) => void
  setSidebarCollapsed: (v: boolean) => void
  setLastToolId: (id: string) => void
  commandOpen: boolean
  setCommandOpen: (v: boolean) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      theme: 'dark',
      sidebarCollapsed: false,
      lastToolId: null,
      commandOpen: false,
      setTheme: (theme) => set({ theme }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setLastToolId: (lastToolId) => set({ lastToolId }),
      setCommandOpen: (commandOpen) => set({ commandOpen })
    }),
    {
      name: 'devutils-app',
      partialize: (s) => ({
        theme: s.theme,
        sidebarCollapsed: s.sidebarCollapsed,
        lastToolId: s.lastToolId
      })
    }
  )
)
