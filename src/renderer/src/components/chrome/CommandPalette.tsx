import { useEffect, useId, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { Command } from 'cmdk'
import { Clock3, Search, Star, X } from 'lucide-react'
import { getToolById, searchTools, toolGroups, type ToolDefinition } from '@renderer/registry/tools'
import { useAppStore } from '@renderer/store/app-store'
import { cn } from '@renderer/lib/utils'

const GROUP_CLASS = '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-mac-label-secondary'

export function CommandPalette(): JSX.Element {
  const open = useAppStore((state) => state.commandOpen)
  const setOpen = useAppStore((state) => state.setCommandOpen)
  const recentToolIds = useAppStore((state) => state.recentToolIds)
  const favoriteToolIds = useAppStore((state) => state.favoriteToolIds)
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const results = useMemo(() => searchTools(query), [query])
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

  useEffect(() => { if (!open) setQuery('') }, [open])
  const openTool = (id: string): void => {
    navigate(`/tool/${id}`)
    setOpen(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="mac-overlay-enter fixed inset-0 z-[100] bg-black/45" />
        <Dialog.Content className={cn('mac-sheet-enter fixed left-1/2 top-[14%] z-[101] w-[min(620px,calc(100vw-32px))] -translate-x-1/2 outline-none', 'overflow-hidden rounded-mac-xl border border-mac-separator bg-mac-surface shadow-[var(--mac-shadow-lg)]')}>
          <Dialog.Title className="sr-only">Search tools</Dialog.Title>
          <Dialog.Description className="sr-only">Search tools by name or task. Use the arrow keys to choose a tool and Enter to open it.</Dialog.Description>
          <Command className="flex flex-col" shouldFilter={false} loop>
            <div className="flex items-center gap-3 border-b border-mac-separator px-4">
              <Search aria-hidden="true" className="h-5 w-5 shrink-0 text-mac-label-secondary" />
              <Command.Input aria-label="Search tools" value={query} onValueChange={setQuery} placeholder="Search tools…" className="h-14 w-full bg-transparent text-[16px] text-mac-label outline-none placeholder:text-mac-label-secondary" autoFocus />
              <Dialog.Close asChild><button type="button" aria-label="Close tool search" title="Close tool search" className="mac-btn-ghost !h-8 !w-8 !min-h-0 shrink-0 !p-0"><X aria-hidden="true" className="h-4 w-4" /></button></Dialog.Close>
            </div>
            <Command.List className="max-h-[min(420px,55vh)] overflow-y-auto p-2">
              <Command.Empty className="px-4 py-10 text-center"><p className="text-[15px] font-semibold text-mac-label">No tools found</p><p className="mt-2 text-[13px] text-mac-label-secondary">Try a task like “format”, “convert” or “date”.</p></Command.Empty>
              {browsing && favorites.length > 0 && <Command.Group heading="Favorites" className={GROUP_CLASS}>{favorites.map((tool) => <PaletteItem key={tool.id} tool={tool} onSelect={openTool} badge={<Star aria-hidden="true" className="h-3.5 w-3.5 text-mac-accent" />} />)}</Command.Group>}
              {browsing && recent.length > 0 && <Command.Group heading="Recent" className={GROUP_CLASS}>{recent.map((tool) => <PaletteItem key={tool.id} tool={tool} onSelect={openTool} badge={<Clock3 aria-hidden="true" className="h-3.5 w-3.5 text-mac-label-secondary" />} />)}</Command.Group>}
              {grouped.map((group) => <Command.Group key={group.id} heading={group.name} className={GROUP_CLASS}>{group.tools.map((tool) => <PaletteItem key={tool.id} tool={tool} onSelect={openTool} />)}</Command.Group>)}
            </Command.List>
            <div className="flex flex-wrap items-center gap-4 border-t border-mac-separator bg-mac-control/40 px-4 py-3 text-[12px] text-mac-label-secondary"><span><kbd className="mac-kbd">↑ ↓</kbd> navigate</span><span><kbd className="mac-kbd">Enter</kbd> open tool</span><span className="ml-auto"><kbd className="mac-kbd">Esc</kbd> close</span></div>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function PaletteItem({ tool, onSelect, badge }: { tool: ToolDefinition; onSelect: (id: string) => void; badge?: React.ReactNode }): JSX.Element {
  const Icon = tool.icon
  const descriptionId = useId()
  const groupName = toolGroups.find((group) => group.id === tool.group)?.name
  return (
    <Command.Item value={tool.id} aria-label={tool.name} aria-describedby={descriptionId} onSelect={() => onSelect(tool.id)} className="group flex cursor-pointer items-start gap-3 rounded-mac px-3 py-3 data-[selected=true]:bg-mac-accent-soft aria-selected:bg-mac-accent-soft">
      <span className="mac-icon-tile-accent !h-9 !w-9"><Icon aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} /></span>
      <div className="min-w-0 flex-1"><div className="flex items-center gap-2 text-[14px] font-semibold text-mac-label">{tool.name}{badge}</div><div id={descriptionId} className="mt-0.5 text-[13px] leading-relaxed text-mac-label-secondary">{tool.description}</div></div>
      <span className="max-w-[110px] shrink-0 pt-0.5 text-right text-[11px] text-mac-label-secondary">{groupName}</span>
    </Command.Item>
  )
}
