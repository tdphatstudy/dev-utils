import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock3, Search, Sparkles, Zap, Pipette } from 'lucide-react'
import { APP_NAME, BRAND_TAGLINE } from '@shared/brand'
import { QUICK_TOOLS } from '@shared/quick-actions'
import { useAppStore } from '@renderer/store/app-store'
import {
  getToolById,
  searchTools,
  toolGroups,
  tools,
  type ToolDefinition
} from '@renderer/registry/tools'
import { cn, modShortcut } from '@renderer/lib/utils'
import { AppLogo } from '@renderer/components/chrome/AppLogo'
import { CrashBanner } from '@renderer/components/CrashBanner'
import { LoadingState } from '@renderer/components/ui/LoadingState'

const LAUNCH_FLAG = 'devutils-session-launched'

export function HomePage(): JSX.Element {
  const navigate = useNavigate()
  const launchMode = useAppStore((s) => s.launchMode)
  const lastToolId = useAppStore((s) => s.lastToolId)
  const recentToolIds = useAppStore((s) => s.recentToolIds)
  const setCommandOpen = useAppStore((s) => s.setCommandOpen)
  const [query, setQuery] = useState('')
  const [ready, setReady] = useState(false)
  const [platform, setPlatform] = useState('win32')

  useEffect(() => {
    window.devutils?.platform().then(setPlatform).catch(() => undefined)
  }, [])

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

  const shortcut = modShortcut('K', platform === 'darwin' ? 'Mac' : platform)

  if (!ready) {
    return <LoadingState label="Starting…" />
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10 xl:max-w-5xl">
        <div className="mb-6 flex items-start gap-3 sm:mb-8 sm:gap-4">
          <AppLogo size={56} className="hidden sm:flex" />
          <AppLogo size={40} className="sm:hidden" />
          <div className="min-w-0 pt-0.5 sm:pt-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-mac-label-tertiary">
              {BRAND_TAGLINE}
            </p>
            <h1 className="mt-0.5 text-[24px] font-semibold tracking-[-0.02em] text-mac-label sm:text-[26px]">
              {APP_NAME}
            </h1>
            <p className="mt-1 text-[13px] leading-relaxed text-mac-label-secondary">
              Local developer tools, one workspace. Find a tool with{' '}
              <button
                type="button"
                className="mac-kbd align-middle transition-colors hover:border-mac-accent/40"
                onClick={() => setCommandOpen(true)}
              >
                {shortcut}
              </button>
            </p>
          </div>
        </div>

        <CrashBanner />

        {!query && <section className="mb-7 rounded-mac-xl border border-mac-separator bg-mac-surface p-4 shadow-[var(--mac-shadow-sm)]">
          <div className="mb-3 flex items-center gap-2 text-[12px] font-semibold text-mac-label"><Zap className="h-4 w-4 text-mac-accent" />Quick access</div>
          <div className="flex flex-wrap gap-2">{QUICK_TOOLS.map((item) => {
            const tool = getToolById(item.id)!
            const Icon = tool.icon
            return <button key={item.id} type="button" className="mac-btn-secondary gap-2 !text-[12px]" onClick={() => openTool(item.id)}><Icon className="h-3.5 w-3.5" />{tool.name}</button>
          })}</div>
          <p className="mt-3 flex items-start gap-1.5 text-[12px] leading-relaxed text-mac-label-secondary"><Pipette className="mt-0.5 h-3.5 w-3.5 shrink-0" />Desktop tray: pick a screen color, copy a UUID, or reopen a tool. Close the window to release its memory.</p>
        </section>}

        <div className="relative mb-8">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-mac-label-tertiary" />
          <input
            autoFocus
            className="mac-input !h-12 rounded-mac-xl pl-10 pr-16 text-[15px] shadow-[var(--mac-shadow-sm)]"
            placeholder="Search tools… JSON, regex, JWT, QR, HTTP…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && filtered[0]) openTool(filtered[0].id)
            }}
          />
          {query ? (
            <button
              type="button"
              className="mac-btn-ghost absolute right-1.5 top-1/2 h-8 -translate-y-1/2 !px-2 text-[12px]"
              onClick={() => setQuery('')}
            >
              Clear
            </button>
          ) : (
            <kbd className="mac-kbd pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
              {shortcut}
            </kbd>
          )}
        </div>

        {!query && recent.length > 0 && (
          <section className="mb-8">
            <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-mac-label-tertiary">
              <Clock3 className="h-3.5 w-3.5" />
              Recent
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {recent.map((tool) => (
                <ToolCard key={tool.id} tool={tool} onOpen={openTool} recent />
              ))}
            </div>
          </section>
        )}

        {query ? (
          <section>
            <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-mac-label-tertiary">
              Results · {filtered.length}
            </div>
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-mac-xl border border-dashed border-mac-separator px-6 py-14 text-center">
                <Search className="mb-3 h-8 w-8 text-mac-label-tertiary opacity-50" strokeWidth={1.4} />
                <p className="text-[14px] font-medium text-mac-label">No tools match “{query}”</p>
                <p className="mt-1 text-[12px] text-mac-label-secondary">
                  Try another keyword or clear the search.
                </p>
                <button type="button" className="mac-btn-secondary mt-4" onClick={() => setQuery('')}>
                  Clear search
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
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
                  <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-mac-label-tertiary">
                    <Icon className="h-3.5 w-3.5" />
                    {g.name}
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
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
          Default on launch is Home. Prefer resuming your last tool? Settings → On launch.
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
    <button type="button" onClick={() => onOpen(tool.id)} className="mac-card flex items-start gap-3 px-3.5 py-3">
      <span className={cn(recent ? 'mac-icon-tile-accent' : 'mac-icon-tile')}>
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold tracking-tight text-mac-label">
          {tool.name}
        </span>
        <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-mac-label-secondary">
          {tool.description}
        </span>
      </span>
    </button>
  )
}
