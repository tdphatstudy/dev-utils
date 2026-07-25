import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { Command } from 'cmdk'
import { searchTools } from '@renderer/registry/tools'
import { useAppStore } from '@renderer/store/app-store'
import { cn } from '@renderer/lib/utils'
import { Search } from 'lucide-react'

export function CommandPalette(): JSX.Element {
  const open = useAppStore((s) => s.commandOpen)
  const setOpen = useAppStore((s) => s.setCommandOpen)
  const setLastToolId = useAppStore((s) => s.setLastToolId)
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  const results = useMemo(() => searchTools(query), [query])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-[18%] z-[101] w-[min(560px,92vw)] -translate-x-1/2 outline-none',
            'overflow-hidden rounded-mac-xl border border-mac-separator bg-mac-surface/95 shadow-mac-lg backdrop-blur-xl'
          )}
        >
          <Dialog.Title className="sr-only">Search tools</Dialog.Title>
          <Command className="flex flex-col" shouldFilter={false}>
            <div className="flex items-center gap-2 border-b border-mac-separator px-3">
              <Search className="h-4 w-4 text-mac-label-tertiary" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Search tools…"
                className="h-12 w-full bg-transparent text-[15px] text-mac-label outline-none placeholder:text-mac-label-tertiary"
                autoFocus
              />
            </div>
            <Command.List className="max-h-[320px] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-6 text-center text-[13px] text-mac-label-tertiary">
                No tools found
              </Command.Empty>
              {results.map((tool) => {
                const Icon = tool.icon
                return (
                  <Command.Item
                    key={tool.id}
                    value={tool.id}
                    onSelect={() => {
                      setLastToolId(tool.id)
                      navigate(`/tool/${tool.id}`)
                      setOpen(false)
                    }}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-mac px-3 py-2.5 text-[13px]',
                      'data-[selected=true]:bg-mac-accent data-[selected=true]:text-white',
                      'aria-selected:bg-mac-accent aria-selected:text-white'
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 opacity-90" strokeWidth={1.75} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{tool.name}</div>
                      <div className="truncate text-[11px] opacity-70">{tool.description}</div>
                    </div>
                    <span className="text-[10px] uppercase tracking-wide opacity-60">
                      {tool.group}
                    </span>
                  </Command.Item>
                )
              })}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
