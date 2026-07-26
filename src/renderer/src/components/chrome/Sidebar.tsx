import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { toolGroups, getToolsByGroup } from '@renderer/registry/tools'
import { useAppStore } from '@renderer/store/app-store'
import { cn } from '@renderer/lib/utils'
import { useIsNarrow } from '@renderer/hooks/useMediaQuery'
import { Home, PanelLeftClose, PanelLeft } from 'lucide-react'
import { AppLogo } from './AppLogo'

function navClass(isActive: boolean, compact: boolean): string {
  return cn(
    'mac-nav-item',
    compact && 'justify-center !px-0',
    isActive ? 'mac-nav-item-active' : 'text-mac-label-secondary'
  )
}

export function Sidebar(): JSX.Element {
  const collapsed = useAppStore((s) => s.sidebarCollapsed)
  const setCollapsed = useAppStore((s) => s.setSidebarCollapsed)
  const setLastToolId = useAppStore((s) => s.setLastToolId)
  const isNarrow = useIsNarrow()
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    if (!isNarrow) setDrawerOpen(false)
  }, [isNarrow])

  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  const showLabels = isNarrow ? drawerOpen : !collapsed

  const toggle = (): void => {
    if (isNarrow) setDrawerOpen((v) => !v)
    else setCollapsed(!collapsed)
  }

  const closeDrawer = (): void => {
    if (isNarrow) setDrawerOpen(false)
  }

  const nav = (
    <>
      <div
        className={cn(
          'flex pb-2 pt-3',
          !showLabels ? 'flex-col items-center gap-1.5 px-1' : 'items-center gap-1 px-2.5'
        )}
      >
        {showLabels ? (
          <Link
            to="/"
            title="Home"
            aria-label="Home"
            className="min-w-0 flex-1 rounded-mac hover:opacity-90"
            onClick={closeDrawer}
          >
            <AppLogo size={28} showWordmark className="px-0.5" />
          </Link>
        ) : (
          <Link
            to="/"
            title="Home"
            aria-label="Home"
            className="rounded-mac hover:opacity-90"
            onClick={closeDrawer}
          >
            <AppLogo size={28} />
          </Link>
        )}
        <button
          type="button"
          onClick={toggle}
          className="mac-btn-ghost h-7 w-7 shrink-0 !p-0"
          aria-label={
            isNarrow
              ? drawerOpen
                ? 'Close menu'
                : 'Open menu'
              : collapsed
                ? 'Expand sidebar'
                : 'Collapse sidebar'
          }
          title={
            isNarrow
              ? drawerOpen
                ? 'Close menu'
                : 'Open menu'
              : collapsed
                ? 'Expand sidebar'
                : 'Collapse sidebar'
          }
        >
          {isNarrow ? (
            drawerOpen ? (
              <PanelLeftClose className="h-3.5 w-3.5" />
            ) : (
              <PanelLeft className="h-3.5 w-3.5" />
            )
          ) : collapsed ? (
            <PanelLeft className="h-3.5 w-3.5" />
          ) : (
            <PanelLeftClose className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4 pt-1" aria-label="Tools">
        <div className="mb-3">
          <NavLink
            to="/"
            end
            title="Home"
            aria-label="Home"
            onClick={closeDrawer}
            className={({ isActive }) => navClass(isActive, !showLabels)}
          >
            <Home className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            {showLabels && <span className="truncate">Home</span>}
          </NavLink>
        </div>

        {toolGroups.map((group) => {
          const groupTools = getToolsByGroup(group.id)
          if (groupTools.length === 0) return null
          const GroupIcon = group.icon

          return (
            <div key={group.id} className="mb-3">
              {showLabels ? (
                <div className="mb-1 flex items-center gap-1.5 px-2.5 py-1">
                  <GroupIcon className="h-3 w-3 text-mac-label-tertiary" strokeWidth={1.75} />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-mac-label-tertiary">
                    {group.name}
                  </span>
                </div>
              ) : (
                <div className="mb-1 flex justify-center py-1" title={group.name}>
                  <GroupIcon className="h-3.5 w-3.5 text-mac-label-tertiary" strokeWidth={1.75} />
                </div>
              )}
              <ul className="space-y-0.5">
                {groupTools.map((tool) => {
                  const Icon = tool.icon
                  return (
                    <li key={tool.id}>
                      <NavLink
                        to={`/tool/${tool.id}`}
                        onClick={() => {
                          setLastToolId(tool.id)
                          closeDrawer()
                        }}
                        title={tool.name}
                        aria-label={tool.name}
                        className={({ isActive }) => navClass(isActive, !showLabels)}
                      >
                        <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                        {showLabels && <span className="truncate">{tool.name}</span>}
                      </NavLink>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </nav>
    </>
  )

  return (
    <>
      <aside
        className={cn(
          'relative z-30 flex h-full shrink-0 flex-col border-r border-mac-separator bg-mac-sidebar transition-[width] duration-200 ease-mac',
          isNarrow || collapsed ? 'w-[56px]' : 'w-[220px]'
        )}
      >
        {isNarrow ? (
          <div className="flex h-full flex-col">
            <div className="flex flex-col items-center gap-1.5 px-1 pb-2 pt-3">
              <Link
                to="/"
                title="Home"
                aria-label="Home"
                className="rounded-mac hover:opacity-90"
                onClick={closeDrawer}
              >
                <AppLogo size={28} />
              </Link>
              <button
                type="button"
                onClick={toggle}
                className="mac-btn-ghost h-7 w-7 shrink-0 !p-0"
                title={drawerOpen ? 'Close menu' : 'Open menu'}
                aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
              >
                {drawerOpen ? (
                  <PanelLeftClose className="h-3.5 w-3.5" />
                ) : (
                  <PanelLeft className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-1 pb-4 pt-1" aria-label="Tools">
              <div className="mb-2 flex justify-center">
                <NavLink
                  to="/"
                  end
                  title="Home"
                  aria-label="Home"
                  onClick={closeDrawer}
                  className={({ isActive }) =>
                    cn(
                      'flex h-9 w-9 items-center justify-center rounded-mac transition-colors duration-150',
                      isActive
                        ? 'bg-mac-accent-soft text-mac-accent'
                        : 'text-mac-label-secondary hover:bg-mac-control'
                    )
                  }
                >
                  <Home className="h-4 w-4" strokeWidth={1.75} />
                </NavLink>
              </div>
              {toolGroups.map((group) => {
                const groupTools = getToolsByGroup(group.id)
                if (groupTools.length === 0) return null
                return (
                  <div key={group.id} className="mb-2 space-y-0.5">
                    {groupTools.map((tool) => {
                      const Icon = tool.icon
                      return (
                        <NavLink
                          key={tool.id}
                          to={`/tool/${tool.id}`}
                          title={tool.name}
                          aria-label={tool.name}
                          onClick={() => {
                            setLastToolId(tool.id)
                            closeDrawer()
                          }}
                          className={({ isActive }) =>
                            cn(
                              'mx-auto flex h-9 w-9 items-center justify-center rounded-mac transition-colors duration-150',
                              isActive
                                ? 'bg-mac-accent-soft text-mac-accent'
                                : 'text-mac-label-secondary hover:bg-mac-control hover:text-mac-label'
                            )
                          }
                        >
                          <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                        </NavLink>
                      )
                    })}
                  </div>
                )
              })}
            </nav>
          </div>
        ) : (
          nav
        )}
      </aside>

      {isNarrow && drawerOpen && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="mac-overlay-enter fixed inset-0 z-40 bg-black/40"
            onClick={() => setDrawerOpen(false)}
          />
          <aside
            className={cn(
              'fixed bottom-0 left-[56px] top-12 z-50 flex w-[min(240px,calc(100vw-56px))] flex-col',
              'border-r border-mac-separator bg-mac-sidebar shadow-[var(--mac-shadow-lg)]'
            )}
          >
            {nav}
          </aside>
        </>
      )}
    </>
  )
}
