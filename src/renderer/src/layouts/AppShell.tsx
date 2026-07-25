import { Outlet, useLocation } from 'react-router-dom'
import { TitleBar } from '@renderer/components/chrome/TitleBar'
import { Sidebar } from '@renderer/components/chrome/Sidebar'
import { CommandPalette } from '@renderer/components/chrome/CommandPalette'
import { ErrorBoundary } from '@renderer/components/ErrorBoundary'

export function AppShell(): JSX.Element {
  const location = useLocation()

  return (
    <div className="flex h-full flex-col bg-mac-bg">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-hidden bg-mac-bg">
          {/* key remounts boundary when route changes so a fixed tool does not stick */}
          <ErrorBoundary key={location.pathname} scope="route" autoHomeMs={4000}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
      <CommandPalette />
    </div>
  )
}
