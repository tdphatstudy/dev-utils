import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock3, Search, Sparkles } from 'lucide-react'
import { useAppStore } from '@renderer/store/app-store'
import {
  getToolById,
  searchTools,
  toolGroups,
  tools,
  type ToolDefinition
} from '@renderer/registry/tools'
import { cn } from '@renderer/lib/utils'
import { AppLogo } from '@renderer/components/chrome/AppLogo'
import { CrashBanner } from '@renderer/components/CrashBanner'

const LAUNCH_FLAG = 'devutils-session-launched'

export function HomePage(): JSX.Element {
  const navigate = useNavigate()
  const launchMode = useAppStore((s) => s.launchMode)
  const lastToolId = useAppStore((s) => s.lastToolId)
  const recentToolIds = useAppStore((s) => s.recentToolIds)
  const setLastToolId = useAppStore((s) => s.setLastToolId)
  const setCommandOpen = useAppStore((s) => s.setCommandOpen)
  const [query, setQuery] = useState('')
  const [ready, setReady] = useState(false)

  // Once per app session: if launchMode is "last", resume previous tool.
  // Manual visits to Home later stay on Home.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(LAUNCH_FLAG) === '1') {
        setReady(true)
        return
      }
      sessionStorage.setItem(LAUNCH_FLAG, '1')
    } catch {
      /* private mode */
    }

    if (
      launchMode === 'last' &&
      lastToolId &&
      tools.some((t) => t.id === lastToolId)
    ) {
      navigate(`/tool/${lastToolId}`, { replace: true })
      return
    }
    setReady(true)
  }, [launchMode, lastToolId, navigate])

  const filtered = useMemo(() => searchTools(query), [query])

  const recent = useMemo(() => {
    const ids = recentToolIds.length
      ? recentToolIds
      : lastToolId
        ? [lastToolId]
        : []
    return ids
      .map((id) => getToolById(id))
      .filter((t): t is ToolDefinition => Boolean(t))
      .slice(0, 8)
  }, [recentToolIds, lastToolId])

  const openTool = (id: string): void => {
    setLastToolId(id)
    navigate(`/tool/${id}`)
  }

  const groups = useMemo(() => {
    return toolGroups
      .map((g) => ({
        ...g,
        tools: filtered.filter((t) => t.group === g.id && t.group !== 'app')
      }))
      .filter((g) => g.tools.length > 0)
  }, [filtered])

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-mac-label-tertiary">
        Loading…
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-8 flex items-start gap-4">
          <AppLogo size={56} variant="png" />
          <div className="min-w-0 pt-1">
            <h1 className="text-[22px] font-semibold tracking-tight text-mac-label">DevUtils</h1>
            <p className="mt-1 text-[13px] text-mac-label-secondary">
              Local developer tools — pick a tool or press{' '}
              <button
                type="button"
                className="rounded border border-mac-separator bg-mac-control px-1.5 font-mono text-[11px] hover:bg-mac-control-hover"
                onClick={() => setCommandOpen(true)}
              >
                ⌘K
              </button>
            </p>
          </div>
        </div>

        <CrashBanner />

        <div className="relative mb-8">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mac-label-tertiary" />
          <input
            autoFocus
            className="mac-input !h-11 pl-10 text-[15px]"
            placeholder="Search tools… JSON, regex, JWT, QR, HTTP…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && filtered[0]) openTool(filtered[0].id)
            }}
          />
        </div>

        {!query && recent.length > 0 && (
          <section className="mb-8">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-mac-label-tertiary">
              <Clock3 className="h-3.5 w-3.5" />
              Recent
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {recent.map((tool) => (
                <ToolCard key={tool.id} tool={tool} onOpen={openTool} recent />
              ))}
            </div>
          </section>
        )}

        {query ? (
          <section>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-mac-label-tertiary">
              Results · {filtered.length}
            </div>
            {filtered.length === 0 ? (
              <p className="text-[13px] text-mac-label-tertiary">No tools match “{query}”</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {filtered.map((tool) => (
                  <ToolCard key={tool.id} tool={tool} onOpen={openTool} />
                ))}
              </div>
            )}
          </section>
        ) : (
          <div className="space-y-7">
            {groups.map((g) => {
              const Icon = g.icon
              return (
                <section key={g.id}>
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-mac-label-tertiary">
                    <Icon className="h-3.5 w-3.5" />
                    {g.name}
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {g.tools.map((tool) => (
                      <ToolCard key={tool.id} tool={tool} onOpen={openTool} />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        )}

        <p className="mt-10 flex items-start gap-1.5 text-[11px] leading-relaxed text-mac-label-tertiary">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Default on launch is Home (best for multi-tool workflows). Prefer always resuming your last
          tool? Settings → On launch.
        </p>
      </div>
    </div>
  )
}

function ToolCard({
  tool,
  onOpen,
  recent
}: {
  tool: ToolDefinition
  onOpen: (id: string) => void
  recent?: boolean
}): JSX.Element {
  const Icon = tool.icon
  return (
    <button
      type="button"
      onClick={() => onOpen(tool.id)}
      className={cn(
        'flex items-start gap-3 rounded-mac-xl border border-mac-separator bg-mac-surface px-3.5 py-3 text-left shadow-sm transition-all',
        'hover:border-mac-accent/30 hover:bg-mac-accent-soft/40 hover:shadow-mac'
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-mac',
          recent ? 'bg-mac-accent/15 text-mac-accent' : 'bg-mac-control text-mac-label-secondary'
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-mac-label">{tool.name}</span>
        <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-mac-label-secondary">
          {tool.description}
        </span>
      </span>
    </button>
  )
}
