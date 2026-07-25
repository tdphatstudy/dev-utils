import { NavLink } from 'react-router-dom'
import { toolGroups, getToolsByGroup } from '@renderer/registry/tools'
import { useAppStore } from '@renderer/store/app-store'
import { cn } from '@renderer/lib/utils'
import { PanelLeftClose, PanelLeft } from 'lucide-react'
import { AppLogo } from './AppLogo'

export function Sidebar(): JSX.Element {
  const collapsed = useAppStore((s) => s.sidebarCollapsed)
  const setCollapsed = useAppStore((s) => s.setSidebarCollapsed)
  const setLastToolId = useAppStore((s) => s.setLastToolId)

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-mac-separator bg-mac-sidebar/80 backdrop-blur-2xl transition-[width] duration-200 ease-mac',
        collapsed ? 'w-[56px]' : 'w-[220px]'
      )}
    >
      <div
        className={cn(
          'flex pb-2 pt-3',
          collapsed ? 'flex-col items-center gap-1.5 px-1' : 'items-center gap-1 px-2.5'
        )}
      >
        {collapsed ? (
          <AppLogo size={28} />
        ) : (
          <AppLogo size={28} showWordmark className="min-w-0 flex-1 px-0.5" />
        )}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="mac-btn-ghost h-7 w-7 shrink-0 !p-0"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeft className="h-3.5 w-3.5" />
          ) : (
            <PanelLeftClose className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4 pt-1">
        {toolGroups.map((group) => {
          const groupTools = getToolsByGroup(group.id)
          if (groupTools.length === 0) return null
          const GroupIcon = group.icon

          return (
            <div key={group.id} className="mb-3">
              {!collapsed && (
                <div className="mb-1 flex items-center gap-1.5 px-2 py-1">
                  <GroupIcon className="h-3 w-3 text-mac-label-tertiary" strokeWidth={1.75} />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
                    {group.name}
                  </span>
                </div>
              )}
              {collapsed && (
                <div className="mb-1 flex justify-center py-1">
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
                        onClick={() => setLastToolId(tool.id)}
                        title={tool.name}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-2.5 rounded-mac px-2.5 py-[7px] text-[13px] transition-colors duration-150',
                            isActive
                              ? 'bg-mac-accent-soft font-medium text-mac-accent'
                              : 'text-mac-label-secondary hover:bg-mac-control hover:text-mac-label',
                            collapsed && 'justify-center px-0'
                          )
                        }
                      >
                        <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                        {!collapsed && <span className="truncate">{tool.name}</span>}
                      </NavLink>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
