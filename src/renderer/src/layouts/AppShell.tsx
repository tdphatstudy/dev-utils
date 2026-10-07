import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { TitleBar } from '@renderer/components/chrome/TitleBar'
import { Sidebar } from '@renderer/components/chrome/Sidebar'
import { CommandPalette } from '@renderer/components/chrome/CommandPalette'
import { ErrorBoundary } from '@renderer/components/ErrorBoundary'
import { useAppStore } from '@renderer/store/app-store'
import { useIsNarrow } from '@renderer/hooks/useMediaQuery'
import { getToolById } from '@renderer/registry/tools'


export function AppShell(): JSX.Element {
  useUiLocale()
  const location = useLocation()
  const navigate = useNavigate()
  const setLastToolId = useAppStore((s) => s.setLastToolId)
  const isNarrow = useIsNarrow()
  const routeTool = getToolById(location.pathname.startsWith('/tool/') ? location.pathname.slice(6) : '')

  useEffect(() => {
    const id = location.pathname.startsWith('/tool/') ? location.pathname.slice(6) : ''
    if (getToolById(id)) setLastToolId(id)
  }, [location.pathname, setLastToolId])

  return (
    <div
      className="mac-app-shell flex h-full flex-col bg-mac-bg"
      data-layout={isNarrow ? 'narrow' : 'regular'}
    >
      <a href="#workspace" className="mac-skip-link mac-btn-primary" onClick={(event) => {
        event.preventDefault()
        document.getElementById('workspace')?.focus()
      }}>{uiText('Skip to workspace')}</a>
      <TitleBar />
      <div className="flex min-h-0 min-w-0 flex-1">
        <Sidebar />
        <main id="workspace" tabIndex={-1} aria-label={routeTool ? `${routeTool.name} workspace` : 'Toolbox workspace'} className="mac-workspace min-w-0 flex-1 overflow-hidden bg-mac-bg focus-visible:outline-none">
          {/* key remounts boundary when route changes so a fixed tool does not stick */}
          <ErrorBoundary key={location.pathname} scope="route" onHome={() => navigate('/')}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">{routeTool ? `${routeTool.name} selected` : 'DevFusion toolbox opened'}</div>
      <CommandPalette />
    </div>
  )
}
