import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './layouts/AppShell'
import { ToolPage } from './pages/ToolPage'
import { HomePage } from './pages/HomePage'
import { useAppStore } from './store/app-store'
import { installGlobalErrorGuards } from './lib/error-guard'
import { ErrorBoundary } from './components/ErrorBoundary'

function useThemeEffect(): void {
  const theme = useAppStore((s) => s.theme)

  useEffect(() => {
    const root = document.documentElement
    const apply = (dark: boolean): void => {
      root.classList.toggle('dark', dark)
    }

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      apply(mq.matches)
      const handler = (e: MediaQueryListEvent): void => apply(e.matches)
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }

    apply(theme === 'dark')
  }, [theme])
}

function useGlobalHotkeys(): void {
  const setCommandOpen = useAppStore((s) => s.setCommandOpen)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCommandOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setCommandOpen])
}

/** Catch window.error + unhandledrejection → bounce to Home. */
function useGlobalErrorGuard(): void {
  useEffect(() => installGlobalErrorGuards(), [])
}

export default function App(): JSX.Element {
  useThemeEffect()
  useGlobalHotkeys()
  useGlobalErrorGuard()

  return (
    <ErrorBoundary scope="app" autoHomeMs={5000}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="tool/:toolId" element={<ToolPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  )
}
