import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Command } from 'cmdk'
import { Clock3, Search, Star } from 'lucide-react'
import { getToolById, searchTools, toolGroups, type ToolDefinition } from '@renderer/registry/tools'
import { useAppStore } from '@renderer/store/app-store'
import { useShortcut } from '@renderer/shortcuts/useShortcuts'
import { formatShortcut } from '@shared/shortcuts'

const GROUP_CLASS = '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-mac-label-secondary'

export default function CommandPaletteContents({ onNavigate }: { onNavigate: () => void }): JSX.Element {
  const { locale } = useUiLocale()
  const recentToolIds = useAppStore((state) => state.recentToolIds)
  const favoriteToolIds = useAppStore((state) => state.favoriteToolIds)
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const results = useMemo(() => searchTools(query, locale), [query, locale])
  const favorites = useMemo(() => favoriteToolIds.map(getToolById)
    .filter((tool): tool is ToolDefinition => Boolean(tool)).slice(0, 6), [favoriteToolIds])
  const recent = useMemo(() => recentToolIds.filter((id) => !favorites.some((tool) => tool.id === id))
    .map(getToolById).filter((tool): tool is ToolDefinition => Boolean(tool)).slice(0, 5), [recentToolIds, favorites])
  const browsing = !query.trim()
  const grouped = useMemo(() => {
    const shortcutIds = browsing ? new Set([...favorites, ...recent].map((tool) => tool.id)) : new Set<string>()
    return toolGroups.map((group) => ({
      ...group,
      tools: results.filter((tool) => tool.group === group.id && !shortcutIds.has(tool.id))
    })).filter((group) => group.tools.length > 0)
  }, [results, browsing, favorites, recent])

  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.focus() }, [])
  const openTool = (id: string): void => {
    navigate(`/tool/${id}`)
    onNavigate()
  }

  return (
    <Command className="flex min-h-0 flex-1 flex-col" shouldFilter={false} loop>
            <div className="mac-command-search flex shrink-0 items-center gap-3 border-b border-mac-separator pl-4 pr-14">
              <Search aria-hidden="true" className="h-5 w-5 shrink-0 text-mac-label-secondary" />
              <Command.Input ref={inputRef} aria-label={uiText('Search tools')} value={query} onValueChange={setQuery} placeholder={uiText('Search tools…')} className="mac-command-input h-14 min-w-0 w-full bg-transparent text-[16px] text-mac-label outline-none placeholder:text-mac-label-secondary" autoFocus />
            </div>
            <Command.List className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
              <Command.Empty className="px-4 py-10 text-center"><p className="text-[15px] font-semibold text-mac-label">{uiText('No tools found')}</p><p className="mt-2 text-[13px] text-mac-label-secondary">Try a task like “format”, “convert” or “date”.</p></Command.Empty>
              {browsing && favorites.length > 0 && <Command.Group heading={uiText('Favorites')} className={GROUP_CLASS}>{favorites.map((tool) => <PaletteItem key={tool.id} tool={tool} onSelect={openTool} badge={<Star aria-hidden="true" className="h-3.5 w-3.5 text-mac-accent" />} />)}</Command.Group>}
              {browsing && recent.length > 0 && <Command.Group heading={uiText('Recent')} className={GROUP_CLASS}>{recent.map((tool) => <PaletteItem key={tool.id} tool={tool} onSelect={openTool} badge={<Clock3 aria-hidden="true" className="h-3.5 w-3.5 text-mac-label-secondary" />} />)}</Command.Group>}
              {grouped.map((group) => <Command.Group key={group.id} heading={uiText(group.name)} className={GROUP_CLASS}>{group.tools.map((tool) => <PaletteItem key={tool.id} tool={tool} onSelect={openTool} />)}</Command.Group>)}
            </Command.List>
            <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-mac-separator bg-mac-control/40 px-4 py-3 text-[12px] text-mac-label-secondary"><span><kbd className="mac-kbd">↑ ↓</kbd> navigate</span><span><kbd className="mac-kbd">Enter</kbd> open tool</span><span className="ml-auto"><kbd className="mac-kbd">Esc</kbd> close</span></div>
          </Command>
  )
}

function PaletteItem({ tool, onSelect, badge }: { tool: ToolDefinition; onSelect: (id: string) => void; badge?: React.ReactNode }): JSX.Element {
  useUiLocale()
  const Icon = tool.icon
  const descriptionId = useId()
  const groupName = toolGroups.find((group) => group.id === tool.group)?.name
  const shortcut = useShortcut(tool.id === 'app.settings' ? 'app.settings' : 'tool.' + tool.id)
  return (
    <Command.Item value={tool.id} aria-label={uiText(tool.name)} aria-describedby={descriptionId} onSelect={() => onSelect(tool.id)} className="group flex cursor-pointer items-start gap-3 rounded-mac px-3 py-3 data-[selected=true]:bg-mac-accent-soft aria-selected:bg-mac-accent-soft">
      <span className="mac-icon-tile-accent !h-9 !w-9"><Icon aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} /></span>
      <div className="min-w-0 flex-1"><div className="flex items-center gap-2 text-[14px] font-semibold text-mac-label">{uiText(tool.name)}{badge}</div><div id={descriptionId} className="mt-0.5 text-[13px] leading-relaxed text-mac-label-secondary">{uiText(tool.description)}</div></div>
      <span className="max-w-[110px] shrink-0 pt-0.5 text-right text-[11px] text-mac-label-secondary">{groupName}{shortcut.binding && <kbd className="mac-kbd mt-1 block">{formatShortcut(shortcut.binding, shortcut.platform)}</kbd>}</span>
    </Command.Item>
  )
}
