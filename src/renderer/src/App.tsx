import { useToolPreloading } from './hooks/useToolPreloading'
import { useEffect, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useAppStore } from './store/app-store'
import { installGlobalErrorGuards } from './lib/error-guard'
import { ErrorBoundary } from './components/ErrorBoundary'
import { quickTargetPath } from '@shared/quick-actions'

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
      if (e.defaultPrevented) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        // A confirmation dialog owns focus, including while a write is pending.
        // Opening another modal underneath it would break both focus scopes.
        if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return
        setCommandOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setCommandOpen])
}

/** Show async failure feedback without discarding the current tool. */
function useGlobalErrorGuard(): [boolean, () => void] {
  const [failed, setFailed] = useState(false)
  useEffect(() => installGlobalErrorGuards(() => setFailed(true)), [])
  return [failed, () => setFailed(false)]
}

export default function App(): JSX.Element {
  useThemeEffect()
  useToolPreloading()
  useGlobalHotkeys()
  const [failed, dismissError] = useGlobalErrorGuard()
  const navigate = useNavigate()
  useEffect(() => window.devutils?.app?.onOpenTool((target) => navigate(quickTargetPath(target))), [navigate])

  return (
    <ErrorBoundary scope="app" onHome={() => navigate('/')}>
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1"><Outlet /></div>
        {failed && <div role="alert" className="flex shrink-0 flex-wrap items-center gap-3 border-t border-mac-danger/30 bg-mac-surface px-4 py-3 text-[13px]">
          <p className="min-w-0 flex-1 text-mac-label">An action failed. Your tool is still open; try the action again.</p>
          <button type="button" className="mac-btn-secondary" onClick={dismissError}>Dismiss</button>
        </div>}
      </div>
    </ErrorBoundary>
  )
}
