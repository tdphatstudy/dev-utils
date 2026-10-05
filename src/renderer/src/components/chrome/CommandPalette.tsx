import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { Command } from 'cmdk'
import {
  getToolById,
  searchTools,
  toolGroups,
  type ToolDefinition
} from '@renderer/registry/tools'
import { useAppStore } from '@renderer/store/app-store'
import { cn, modKeyLabel } from '@renderer/lib/utils'
import { Clock3, Search } from 'lucide-react'

export function CommandPalette(): JSX.Element {
  const open = useAppStore((s) => s.commandOpen)
  const setOpen = useAppStore((s) => s.setCommandOpen)
  const recentToolIds = useAppStore((s) => s.recentToolIds)
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [platform, setPlatform] = useState('win32')

  useEffect(() => {
    window.devutils?.platform().then(setPlatform).catch(() => undefined)
  }, [])

  const results = useMemo(() => searchTools(query), [query])

  const recent = useMemo(() => {
    return recentToolIds
      .map((id) => getToolById(id))
      .filter((t): t is ToolDefinition => Boolean(t))
      .slice(0, 5)
  }, [recentToolIds])

  const grouped = useMemo(() => {
    return toolGroups
      .map((g) => ({
        ...g,
        tools: results.filter((t) => t.group === g.id)
      }))
      .filter((g) => g.tools.length > 0)
  }, [results])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const openTool = (id: string): void => {
    navigate(`/tool/${id}`)
    setOpen(false)
  }

  const mod = modKeyLabel(platform === 'darwin' ? 'Mac' : platform)
  const showRecent = !query.trim() && recent.length > 0

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="mac-overlay-enter fixed inset-0 z-[100] bg-black/45" />
        <Dialog.Content
          className={cn(
            'mac-sheet-enter fixed left-1/2 top-[16%] z-[101] w-[min(560px,92vw)] -translate-x-1/2 outline-none',
            'overflow-hidden rounded-mac-xl border border-mac-separator bg-mac-surface shadow-[var(--mac-shadow-lg)]'
          )}
        >
          <Dialog.Title className="sr-only">Search tools</Dialog.Title>
          <Command className="flex flex-col" shouldFilter={false}>
            <div className="flex items-center gap-2.5 border-b border-mac-separator px-3.5">
              <Search className="h-4 w-4 shrink-0 text-mac-label-tertiary" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Search tools…"
                className="h-12 w-full bg-transparent text-[15px] tracking-tight text-mac-label outline-none placeholder:text-mac-label-tertiary"
                autoFocus
              />
            </div>
            <Command.List className="max-h-[min(360px,50vh)] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-10 text-center text-[13px] text-mac-label-tertiary">
                No tools match “{query}”
              </Command.Empty>

              {showRecent && (
                <Command.Group
                  heading="Recent"
                  className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.06em] [&_[cmdk-group-heading]]:text-mac-label-tertiary"
                >
                  {recent.map((tool) => (
                    <PaletteItem
                      key={`recent-${tool.id}`}
                      tool={tool}
                      onSelect={openTool}
                      badge={<Clock3 className="h-3 w-3 opacity-50" />}
                    />
                  ))}
                </Command.Group>
              )}

              {grouped.map((group) => (
                <Command.Group
                  key={group.id}
                  heading={group.name}
                  className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.06em] [&_[cmdk-group-heading]]:text-mac-label-tertiary"
                >
                  {group.tools.map((tool) => (
                    <PaletteItem key={tool.id} tool={tool} onSelect={openTool} />
                  ))}
                </Command.Group>
              ))}
            </Command.List>
            <div className="flex items-center gap-3 border-t border-mac-separator bg-mac-control/40 px-3.5 py-2 text-[11px] text-mac-label-tertiary">
              <span>
                <kbd className="mac-kbd">↑↓</kbd> navigate
              </span>
              <span>
                <kbd className="mac-kbd">↵</kbd> open
              </span>
              <span>
                <kbd className="mac-kbd">esc</kbd> close
              </span>
              <span className="ml-auto hidden sm:inline">
                <kbd className="mac-kbd">{mod}K</kbd>
              </span>
            </div>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function PaletteItem({
  tool,
  onSelect,
  badge
}: {
  tool: ToolDefinition
  onSelect: (id: string) => void
  badge?: React.ReactNode
}): JSX.Element {
  const Icon = tool.icon
  return (
    <Command.Item
      value={`${tool.id} ${tool.name} ${tool.keywords.join(' ')}`}
      onSelect={() => onSelect(tool.id)}
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-mac px-2.5 py-2 text-[13px]',
        'data-[selected=true]:bg-mac-accent-soft data-[selected=true]:text-mac-accent',
        'aria-selected:bg-mac-accent-soft aria-selected:text-mac-accent'
      )}
    >
      <span className="mac-icon-tile h-8 w-8 !rounded-[9px] data-[selected]:bg-mac-accent/15">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-medium tracking-tight text-mac-label data-[selected]:text-mac-accent">
          {tool.name}
        </div>
        <div className="truncate text-[11px] text-mac-label-tertiary">{tool.description}</div>
      </div>
      {badge}
      <span className="text-[10px] uppercase tracking-wide text-mac-label-tertiary opacity-70">
        {tool.group}
      </span>
    </Command.Item>
  )
}
