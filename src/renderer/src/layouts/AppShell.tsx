import { Outlet } from 'react-router-dom'
import { TitleBar } from '@renderer/components/chrome/TitleBar'
import { Sidebar } from '@renderer/components/chrome/Sidebar'
import { CommandPalette } from '@renderer/components/chrome/CommandPalette'

export function AppShell(): JSX.Element {
  return (
    <div className="flex h-full flex-col bg-mac-bg">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-hidden bg-mac-bg">
          <Outlet />
        </main>
      </div>
      <CommandPalette />
    </div>
  )
}
