import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useShortcut } from '@renderer/shortcuts/useShortcuts'
import { formatShortcut } from '@shared/shortcuts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { ChevronDown, Home, PanelLeftClose, PanelLeft, Search, X } from 'lucide-react'
import { toolGroups, getToolsByGroup, getToolById, searchTools, type ToolDefinition } from '@renderer/registry/tools'
import { useAppStore } from '@renderer/store/app-store'
import { cn } from '@renderer/lib/utils'
import { useIsNarrow } from '@renderer/hooks/useMediaQuery'
import { AppLogo } from './AppLogo'

function navClass(isActive: boolean, compact: boolean): string {
  return cn('mac-nav-item', compact && 'justify-center !px-0', isActive ? 'mac-nav-item-active' : 'text-mac-label-secondary')
}

export function Sidebar(): JSX.Element {
  const paletteShortcut = useShortcut('app.palette')
  const { locale } = useUiLocale()
  const collapsed = useAppStore((state) => state.sidebarCollapsed)
  const setCollapsed = useAppStore((state) => state.setSidebarCollapsed)
  const setCommandOpen = useAppStore((state) => state.setCommandOpen)
  const isNarrow = useIsNarrow()
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [closedGroups, setClosedGroups] = useState<Set<string>>(() => new Set())
  const menuTrigger = useRef<HTMLButtonElement>(null)
  const filterInput = useRef<HTMLInputElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const drawerNavRef = useRef<HTMLElement>(null)
  const currentTool = getToolById(location.pathname.startsWith('/tool/') ? location.pathname.slice(6) : '')
  const matchedIds = useMemo(() => new Set(searchTools(query, locale).map((tool) => tool.id)), [query, locale])
  const filtering = Boolean(query.trim())
  const showLabels = !collapsed || isNarrow

  useEffect(() => {
    if (!isNarrow) setDrawerOpen(false)
  }, [isNarrow])

  useEffect(() => {
    setQuery('')
    setDrawerOpen(false)
    if (currentTool) setClosedGroups((previous) => {
      const next = new Set(previous)
      next.delete(currentTool.group)
      return next
    })
  }, [location.pathname, currentTool?.group])

  useEffect(() => {
    // Reveal the route selected by the palette, tray or a Home card.
    const nav = drawerOpen ? drawerNavRef.current : navRef.current
    nav?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' })
  }, [location.pathname, collapsed, drawerOpen])

  const closeDrawer = (): void => { setDrawerOpen(false) }
  const toggleGroup = (groupId: string): void => {
    setClosedGroups((previous) => {
      const next = new Set(previous)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }
  const toolLink = (tool: ToolDefinition, compact: boolean): JSX.Element => {
    const Icon = tool.icon
    return <NavLink to={`/tool/${tool.id}`} onClick={closeDrawer} title={uiText(tool.name)} aria-label={uiText(tool.name)} className={({ isActive }) => navClass(isActive, compact)}><Icon aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={1.75} />{!compact && <span className="truncate">{uiText(tool.name)}</span>}</NavLink>
  }
  const navigation = (compact: boolean, inDrawer = false): JSX.Element => (
    <>
      {!compact && <div className="px-3 pb-3">
        <div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mac-label-secondary" /><input ref={filterInput} aria-label={uiText('Filter sidebar tools')} type="search" placeholder={uiText('Filter tools…')} className="mac-input !ps-8 !pe-8 !text-[12px]" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape' && query) { event.stopPropagation(); setQuery('') } }} />{query && <button type="button" aria-label={uiText('Clear sidebar filter')} className="mac-btn-ghost absolute end-1 top-1/2 !h-6 !w-6 !min-h-0 -translate-y-1/2 !p-0" onClick={() => { setQuery(''); filterInput.current?.focus() }}><X aria-hidden="true" className="h-3.5 w-3.5" /></button>}</div>
      </div>}
      {compact && <div className="px-2 pb-2"><button type="button" aria-label={uiText('Search tools')} title={uiText('Search tools') + (paletteShortcut.binding ? ` (${formatShortcut(paletteShortcut.binding, paletteShortcut.platform)})` : '')} className="mac-btn-ghost w-full !px-0" onClick={() => setCommandOpen(true)}><Search aria-hidden="true" className="h-4 w-4" /></button></div>}
      <nav ref={inDrawer ? drawerNavRef : navRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-4" aria-label={uiText('Tools')}>
        <NavLink to="/" end title={uiText('Home')} aria-label={uiText('Home')} onClick={closeDrawer} className={({ isActive }) => navClass(isActive, compact)}><Home aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={1.75} />{!compact && <span>{uiText('Home')}</span>}</NavLink>
        {currentTool && !compact && ((filtering && !matchedIds.has(currentTool.id)) || (!filtering && closedGroups.has(currentTool.group))) && <div className="mt-3"><p className="px-2.5 py-1.5 text-[11px] font-semibold text-mac-label-secondary">{uiText('Current tool')}</p>{toolLink(currentTool, false)}</div>}
        {toolGroups.filter((group) => group.id !== 'app').map((group) => {
          const groupTools = getToolsByGroup(group.id).filter((tool) => compact || !filtering || matchedIds.has(tool.id))
          if (!groupTools.length) return null
          const GroupIcon = group.icon
          const expanded = compact || filtering || !closedGroups.has(group.id)
          const groupContainerId = `sidebar-${inDrawer ? 'drawer' : 'rail'}-group-${group.id}`
          return <div key={group.id} className={cn('mt-3', compact && 'border-t border-mac-hairline pt-2')}>
            {!compact && <button type="button" className="mac-btn-ghost mb-1 flex !min-h-[30px] w-full justify-start gap-1.5 !px-2.5 !py-1 !text-[11px] font-semibold" aria-expanded={expanded} aria-controls={groupContainerId} onClick={() => toggleGroup(group.id)} disabled={filtering}><GroupIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{uiText(group.name)}</span><span className="ml-auto text-[11px] font-normal">{groupTools.length}</span><ChevronDown aria-hidden="true" className={cn('h-3.5 w-3.5 shrink-0 transition-transform', !expanded && '-rotate-90')} /></button>}
            <ul id={groupContainerId} hidden={!expanded} className="space-y-0.5">{groupTools.map((tool) => <li key={tool.id}>{toolLink(tool, compact)}</li>)}</ul>
          </div>
        })}
        {filtering && !compact && matchedIds.size === 0 && <p role="status" className="px-2.5 py-4 text-[12px] leading-relaxed text-mac-label-secondary">{uiText('No tools found. Try “JSON”, “date” or “convert”.')}</p>}
      </nav>
      <nav aria-label={uiText('App')} className="shrink-0 border-t border-mac-separator px-2 py-2">{getToolsByGroup('app').filter((tool) => compact || !filtering || matchedIds.has(tool.id)).map((tool) => <div key={tool.id}>{toolLink(tool, compact)}</div>)}</nav>
    </>
  )

  return (
    <Dialog.Root open={isNarrow && drawerOpen} onOpenChange={setDrawerOpen}>
      <aside aria-label={uiText('Sidebar')} className={cn('mac-glass relative z-30 flex h-full shrink-0 flex-col border-r border-mac-separator bg-mac-sidebar transition-[width] duration-200 ease-mac', isNarrow || collapsed ? 'w-[56px]' : 'w-[232px]')}>
        <div className={cn('flex pb-3 pt-4', isNarrow || collapsed ? 'flex-col items-center gap-2 px-1' : 'items-center gap-1 px-3')}>
          <Link to="/" title={uiText('Home')} aria-label={uiText('Home')} className={cn('rounded-mac hover:opacity-90', !isNarrow && !collapsed && 'min-w-0 flex-1')} onClick={closeDrawer}><AppLogo size={28} showWordmark={!isNarrow && !collapsed} /></Link>
          {isNarrow ? <Dialog.Trigger asChild><button ref={menuTrigger} type="button" className="mac-btn-ghost !h-8 !w-8 !min-h-0 !p-0" aria-label={uiText('Open menu')} title={uiText('Open menu')}><PanelLeft aria-hidden="true" className="h-4 w-4" /></button></Dialog.Trigger> : <button type="button" onClick={() => setCollapsed(!collapsed)} className="mac-btn-ghost !h-8 !w-8 !min-h-0 shrink-0 !p-0" aria-label={collapsed ? uiText('Expand sidebar') : uiText('Collapse sidebar')} title={collapsed ? uiText('Expand sidebar') : uiText('Collapse sidebar')}>{collapsed ? <PanelLeft aria-hidden="true" className="h-4 w-4" /> : <PanelLeftClose aria-hidden="true" className="h-4 w-4" />}</button>}
        </div>
        {navigation(isNarrow || !showLabels)}
      </aside>
      {isNarrow && <Dialog.Portal>
        <Dialog.Overlay className="mac-overlay-enter fixed inset-0 z-[80] bg-black/40" />
        <Dialog.Content className="fixed bottom-0 start-[56px] top-[var(--titlebar-height)] z-[81] flex w-[min(280px,calc(100vw-56px))] flex-col border-r border-mac-separator bg-mac-sidebar shadow-[var(--mac-shadow-lg)] outline-none" onOpenAutoFocus={(event) => { event.preventDefault(); filterInput.current?.focus() }} onCloseAutoFocus={(event) => { event.preventDefault(); menuTrigger.current?.focus() }} onEscapeKeyDown={(event) => { if (query) { event.preventDefault(); setQuery('') } }}>
          <div className="flex items-center justify-between gap-2 px-3 py-4"><Dialog.Title className="text-[15px] font-semibold text-mac-label">{uiText('Find a tool')}</Dialog.Title><Dialog.Close asChild><button type="button" aria-label={uiText('Close menu')} title={uiText('Close menu')} className="mac-btn-ghost !h-8 !w-8 !min-h-0 !p-0"><X aria-hidden="true" className="h-4 w-4" /></button></Dialog.Close></div>
          <Dialog.Description className="sr-only">{uiText('Search developer tools or choose a category. Escape closes this menu.')}</Dialog.Description>
          {navigation(false, true)}
        </Dialog.Content>
      </Dialog.Portal>}
    </Dialog.Root>
  )
}
