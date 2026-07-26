import { lazy, Suspense, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { TitleBar } from '@renderer/components/chrome/TitleBar'
import { Sidebar } from '@renderer/components/chrome/Sidebar'
import { ErrorBoundary } from '@renderer/components/ErrorBoundary'
import { useAppStore } from '@renderer/store/app-store'
import { useIsNarrow } from '@renderer/hooks/useMediaQuery'

const CommandPalette = lazy(() =>
  import('@renderer/components/chrome/CommandPalette').then((m) => ({
    default: m.CommandPalette
  }))
)

export function AppShell(): JSX.Element {
  const location = useLocation()
  const commandOpen = useAppStore((s) => s.commandOpen)
  const isNarrow = useIsNarrow()
  // Defer cmdk/radix dialog until first open — saves cold-start JS + RAM
  const [paletteReady, setPaletteReady] = useState(false)

  useEffect(() => {
    if (commandOpen) setPaletteReady(true)
  }, [commandOpen])

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
          <ErrorBoundary key={location.pathname} scope="route" autoHomeMs={4000}>
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
