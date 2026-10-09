import { useToolPreloading } from './hooks/useToolPreloading'
import { useEffect, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useAppStore } from './store/app-store'
import { installGlobalErrorGuards } from './lib/error-guard'
import { ErrorBoundary } from './components/ErrorBoundary'
import { quickTargetPath } from '@shared/quick-actions'
import { VaultLockBoundary } from './components/VaultLockBoundary'
import { useLanguageSync, t as uiText } from './i18n'
import { useAppShortcuts } from './shortcuts/useShortcuts'
import { useThemeSync } from './hooks/useThemeSync'

function useThemeEffect(): void {
  const theme = useAppStore((s) => s.theme)
  const surfaceMode = useAppStore((s) => s.surfaceMode)
  const motionMode = useAppStore((s) => s.motionMode)

  useEffect(() => {
    document.documentElement.dataset.surface = surfaceMode
    document.documentElement.dataset.motion = motionMode
  }, [surfaceMode, motionMode])

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

/** Show async failure feedback without discarding the current tool. */
function useGlobalErrorGuard(): [boolean, () => void] {
  const [failed, setFailed] = useState(false)
  useEffect(() => installGlobalErrorGuards(() => setFailed(true)), [])
  return [failed, () => setFailed(false)]
}

export default function App(): JSX.Element {
  useLanguageSync()
  const themeError = useThemeSync()
  useThemeEffect()
  useToolPreloading()
  const shortcutError = useAppShortcuts()
  const [failed, dismissError] = useGlobalErrorGuard()
  const navigate = useNavigate()
  useEffect(() => window.devutils?.app?.onOpenTool((target) => navigate(quickTargetPath(target))), [navigate])

  return (
    <ErrorBoundary scope="app" onHome={() => navigate('/')}>
      <div className="flex h-full flex-col">
        {themeError && <p role="alert" className="shrink-0 bg-mac-surface px-4 py-2 text-[13px] text-mac-danger">{uiText(themeError)}</p>}
        {shortcutError && <p role="alert" className="shrink-0 bg-mac-surface px-4 py-2 text-[13px] text-mac-danger">{shortcutError}</p>}
        <div className="min-h-0 flex-1"><VaultLockBoundary><Outlet /></VaultLockBoundary></div>
        {failed && <div role="alert" className="flex shrink-0 flex-wrap items-center gap-3 border-t border-mac-danger/30 bg-mac-surface px-4 py-3 text-[13px]">
          <p className="min-w-0 flex-1 text-mac-label">{uiText('An action failed. Your tool is still open; try the action again.')}</p>
          <button type="button" className="mac-btn-secondary" onClick={dismissError}>{uiText('Dismiss')}</button>
        </div>}
      </div>
    </ErrorBoundary>
  )
}
