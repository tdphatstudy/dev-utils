import { lazy, Suspense, useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { TitleBar } from '@renderer/components/chrome/TitleBar'
import { Sidebar } from '@renderer/components/chrome/Sidebar'
import { ErrorBoundary } from '@renderer/components/ErrorBoundary'
import { useAppStore } from '@renderer/store/app-store'
import { useIsNarrow } from '@renderer/hooks/useMediaQuery'
import { getToolById } from '@renderer/registry/tools'

const CommandPalette = lazy(() =>
  import('@renderer/components/chrome/CommandPalette').then((m) => ({
    default: m.CommandPalette
  }))
)

export function AppShell(): JSX.Element {
  const location = useLocation()
  const navigate = useNavigate()
  const commandOpen = useAppStore((s) => s.commandOpen)
  const setLastToolId = useAppStore((s) => s.setLastToolId)
  const isNarrow = useIsNarrow()
  // Defer cmdk/radix dialog until first open — saves cold-start JS + RAM
  const [paletteReady, setPaletteReady] = useState(false)

  useEffect(() => {
    if (commandOpen) setPaletteReady(true)
  }, [commandOpen])

  useEffect(() => {
    const id = location.pathname.startsWith('/tool/') ? location.pathname.slice(6) : ''
    if (getToolById(id)) setLastToolId(id)
  }, [location.pathname, setLastToolId])

  return (
    <div
      className="flex h-full flex-col bg-mac-bg"
      data-layout={isNarrow ? 'narrow' : 'regular'}
    >
      <TitleBar />
      <div className="flex min-h-0 min-w-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-hidden bg-mac-bg">
          {/* key remounts boundary when route changes so a fixed tool does not stick */}
          <ErrorBoundary key={location.pathname} scope="route" onHome={() => navigate('/')}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
      {paletteReady && (
        <Suspense fallback={null}>
          <CommandPalette />
        </Suspense>
      )}
    </div>
  )
}
