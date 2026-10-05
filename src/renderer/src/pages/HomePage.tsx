import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUpRight, Clock3, Search, Sparkles, Star, Zap } from 'lucide-react'
import { APP_NAME } from '@shared/brand'
import { useAppStore } from '@renderer/store/app-store'
import { MAX_FAVORITE_TOOLS } from '@renderer/store/app-preferences'
import {
  getToolById,
  searchTools,
  toolGroups,
  tools,
  type ToolDefinition,
  type ToolGroupId
} from '@renderer/registry/tools'
import { cn, modShortcut } from '@renderer/lib/utils'
import { AppLogo } from '@renderer/components/chrome/AppLogo'
import { CrashBanner } from '@renderer/components/CrashBanner'
import { LoadingState } from '@renderer/components/ui/LoadingState'

const LAUNCH_FLAG = 'devutils-session-launched'
const QUICK_STARTS = [
  { id: 'json.studio', description: 'Make a JSON payload readable and explore its structure.' },
  { id: 'network.mock-api', description: 'Give your frontend a local API while the backend is being built.' },
  { id: 'text.ocr', description: 'Turn an image, PDF or screen selection into editable text.' },
  { id: 'design.color', description: 'Pick a color anywhere on your screen and copy its codes.' }
]

export function HomePage(): JSX.Element {
  const navigate = useNavigate()
  const launchMode = useAppStore((s) => s.launchMode)
  const lastToolId = useAppStore((s) => s.lastToolId)
  const recentToolIds = useAppStore((s) => s.recentToolIds)
  const favoriteToolIds = useAppStore((s) => s.favoriteToolIds)
  const toggleFavoriteTool = useAppStore((s) => s.toggleFavoriteTool)
  const setCommandOpen = useAppStore((s) => s.setCommandOpen)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<ToolGroupId | 'all'>('all')
  const [ready, setReady] = useState(false)
  const [platform, setPlatform] = useState('win32')
  const searchInput = useRef<HTMLInputElement>(null)

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
    if (launchMode === 'last' && lastToolId && tools.some((t) => t.id === lastToolId)) {
      navigate(`/tool/${lastToolId}`, { replace: true })
      return
    }
    setReady(true)
  }, [launchMode, lastToolId, navigate])

  const filtered = useMemo(() => searchTools(query).filter((tool) => (
    (query.trim() || tool.group !== 'app') && (category === 'all' || tool.group === category)
  )), [query, category])
  const recent = useMemo(() => (recentToolIds.length ? recentToolIds : lastToolId ? [lastToolId] : [])
    .filter((id) => !favoriteToolIds.includes(id))
    .map(getToolById)
    .filter((tool): tool is ToolDefinition => Boolean(tool && tool.group !== 'app'))
    .slice(0, 4), [recentToolIds, lastToolId, favoriteToolIds])
  const favorites = useMemo(() => favoriteToolIds.map(getToolById)
    .filter((tool): tool is ToolDefinition => Boolean(tool)), [favoriteToolIds])
  const groups = useMemo(() => toolGroups.map((group) => ({
    ...group,
    tools: filtered.filter((tool) => tool.group === group.id)
  })).filter((group) => group.tools.length), [filtered])
  const openTool = (id: string): void => { navigate(`/tool/${id}`) }
  const shortcut = modShortcut('K', platform === 'darwin' ? 'Mac' : platform)
  const browsing = !query.trim() && category === 'all'
  const clearFilters = (): void => {
    setQuery('')
    setCategory('all')
    searchInput.current?.focus()
  }
  const card = (tool: ToolDefinition, description?: string): JSX.Element => (
    <ToolCard
      key={tool.id}
      tool={tool}
      description={description}
      onOpen={openTool}
      favorite={favoriteToolIds.includes(tool.id)}
      favoriteLimit={favoriteToolIds.length >= MAX_FAVORITE_TOOLS}
      onFavorite={toggleFavoriteTool}
    />
  )

  if (!ready) return <LoadingState label="Starting…" />

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-5xl px-5 py-7 lg:px-8 lg:py-9">
        <div className="mb-6 flex items-center gap-3">
          <AppLogo size={44} />
          <div>
            <h1 className="text-[26px] font-semibold tracking-[-0.025em] text-mac-label">{APP_NAME}</h1>
            <p className="mt-1 text-[14px] leading-relaxed text-mac-label-secondary">Your everyday developer toolbox.</p>
          </div>
        </div>

        <CrashBanner />

        <div className="mb-7">
          <label htmlFor="home-tool-search" className="mb-2 block text-[15px] font-semibold text-mac-label">What would you like to do?</label>
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-mac-label-secondary" />
            <input
              id="home-tool-search"
              ref={searchInput}
              autoFocus
              type="search"
              className="mac-input !h-12 rounded-mac-xl !bg-mac-surface !pl-12 !pr-20 !text-[15px] shadow-[var(--mac-shadow-sm)]"
              placeholder="Search tools… JSON, regex, JWT, QR, HTTP…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && filtered[0]) openTool(filtered[0].id)
                if (event.key === 'Escape') clearFilters()
              }}
              aria-describedby="home-search-hint"
            />
            {query ? (
              <button type="button" aria-label="Clear tool search" className="mac-btn-ghost absolute right-2 top-1/2 -translate-y-1/2 !px-2" onClick={() => { setQuery(''); searchInput.current?.focus() }}>Clear</button>
            ) : (
              <button type="button" aria-label={`Open tool search (${shortcut})`} className="mac-btn-ghost absolute right-2 top-1/2 -translate-y-1/2 !px-2" onClick={() => setCommandOpen(true)}><kbd className="mac-kbd">{shortcut}</kbd></button>
            )}
          </div>
          <p id="home-search-hint" className="mt-2 text-[12px] text-mac-label-secondary">Search by name or task. Press Enter to open the first result.</p>
        </div>

        {browsing && (
          <>
            {favorites.length > 0 && (
              <section aria-labelledby="home-favorites" className="mb-8">
                <SectionHeading id="home-favorites" icon={Star} title="Favorites" detail={`${favorites.length} / ${MAX_FAVORITE_TOOLS}`} />
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">{favorites.map((tool) => card(tool))}</div>
              </section>
            )}
            {recent.length > 0 && (
              <section aria-labelledby="home-recent" className="mb-8">
                <SectionHeading id="home-recent" icon={Clock3} title="Pick up where you left off" />
                <div className="flex flex-wrap gap-2">{recent.map((tool) => {
                  const Icon = tool.icon
                  return <button key={tool.id} type="button" className="mac-btn-secondary gap-2" onClick={() => openTool(tool.id)}><Icon aria-hidden="true" className="h-4 w-4" />{tool.name}</button>
                })}</div>
              </section>
            )}
            <section aria-labelledby="home-quick-starts" className="mb-8">
              <SectionHeading id="home-quick-starts" icon={Zap} title="Quick access" detail="A good place to start" />
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{QUICK_STARTS.map((item) => {
                const tool = getToolById(item.id)
                return tool ? card(tool, item.description) : null
              })}</div>
              {favorites.length === 0 && <p className="mt-3 flex items-center gap-1.5 text-[12px] text-mac-label-secondary"><Star aria-hidden="true" className="h-3.5 w-3.5" />Star the tools you use most to keep them in Favorites.</p>}
            </section>
          </>
        )}

        <section aria-labelledby="home-browse">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="home-browse" className="text-[16px] font-semibold text-mac-label">{query.trim() ? 'Search results' : 'Browse tools'}</h2>
              <p role="status" className="mt-1 text-[12px] text-mac-label-secondary">{filtered.length} {filtered.length === 1 ? 'tool' : 'tools'}{category === 'all' ? ' available' : ` in ${toolGroups.find((group) => group.id === category)?.name}`}</p>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="home-category" className="text-[12px] text-mac-label-secondary">Category</label>
              <select id="home-category" className="mac-input !w-auto max-w-[200px]" value={category} onChange={(event) => setCategory(event.target.value as ToolGroupId | 'all')}>
                <option value="all">All categories</option>
                {toolGroups.filter((group) => group.id !== 'app').map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </div>
          </div>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center rounded-mac-xl border border-dashed border-mac-separator px-6 py-12 text-center">
              <Search aria-hidden="true" className="mb-3 h-8 w-8 text-mac-label-secondary" strokeWidth={1.5} />
              <h3 className="text-[16px] font-semibold text-mac-label">No tools found</h3>
              <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-mac-label-secondary">Try a task like “format”, “convert” or “date”, or choose another category.</p>
              <button type="button" className="mac-btn-secondary mt-4" onClick={clearFilters}>Clear search and filters</button>
            </div>
          ) : (
            <div className="space-y-7">{groups.map((group) => {
              const Icon = group.icon
              return <section key={group.id} aria-labelledby={`home-group-${group.id}`}>
                <h3 id={`home-group-${group.id}`} className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-mac-label-secondary"><Icon aria-hidden="true" className="h-4 w-4" />{group.name}<span className="ml-auto text-[12px] font-normal">{group.tools.length}</span></h3>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">{group.tools.map((tool) => card(tool))}</div>
              </section>
            })}</div>
          )}
        </section>

        <p className="mt-9 flex items-start gap-2 border-t border-mac-separator pt-5 text-[12px] leading-relaxed text-mac-label-secondary"><Sparkles aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />Prefer starting with your last tool? Change “On launch” in Settings.</p>
      </div>
    </div>
  )
}

function SectionHeading({ id, icon: Icon, title, detail }: { id: string; icon: typeof Star; title: string; detail?: string }): JSX.Element {
  return <div className="mb-3 flex flex-wrap items-center gap-2"><Icon aria-hidden="true" className="h-4 w-4 text-mac-accent" /><h2 id={id} className="text-[16px] font-semibold text-mac-label">{title}</h2>{detail && <span className="ml-auto text-[12px] text-mac-label-secondary">{detail}</span>}</div>
}

function ToolCard({ tool, onOpen, description, favorite, favoriteLimit, onFavorite }: {
  tool: ToolDefinition
  onOpen: (id: string) => void
  description?: string
  favorite: boolean
  favoriteLimit: boolean
  onFavorite: (id: string) => void
}): JSX.Element {
  const Icon = tool.icon
  const descriptionId = useId()
  const limitReached = favoriteLimit && !favorite
  return (
    <div className="mac-card relative flex min-h-[112px]">
      <button type="button" aria-label={tool.name} aria-describedby={descriptionId} onClick={() => onOpen(tool.id)} className="group flex w-full items-start gap-3 rounded-mac-xl p-4 pr-10 text-left outline-none focus-visible:ring-2 focus-visible:ring-mac-accent">
        <span className="mac-icon-tile-accent"><Icon aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.75} /></span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1 text-[14px] font-semibold tracking-tight text-mac-label">{tool.name}<ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-mac-label-secondary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" /></span>
          <span id={descriptionId} className="mt-1 block text-[13px] leading-relaxed text-mac-label-secondary">{description || tool.description}</span>
        </span>
      </button>
      <button type="button" className={cn('mac-btn-ghost absolute right-1.5 top-1.5 !h-8 !w-8 !min-h-0 !p-0', favorite && '!text-mac-accent')} aria-label={`${favorite ? 'Remove' : 'Add'} ${tool.name} ${favorite ? 'from' : 'to'} favorites`} aria-pressed={favorite} disabled={limitReached} title={limitReached ? `Favorites is full (${MAX_FAVORITE_TOOLS}). Remove a favorite to add another.` : favorite ? 'Remove from favorites' : 'Add to favorites'} onClick={() => onFavorite(tool.id)}><Star aria-hidden="true" className="h-4 w-4" fill={favorite ? 'currentColor' : 'none'} /></button>
    </div>
  )
}
