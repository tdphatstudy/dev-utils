import { Suspense } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getToolById, toolGroups } from '@renderer/registry/tools'
import { LoadingState } from '@renderer/components/ui/LoadingState'
import { Home, ArrowLeft, Star } from 'lucide-react'
import { useAppStore } from '@renderer/store/app-store'
import { MAX_FAVORITE_TOOLS } from '@renderer/store/app-preferences'

export function ToolPage(): JSX.Element {
  const { toolId } = useParams()
  const tool = toolId ? getToolById(toolId) : undefined
  const favorites = useAppStore((state) => state.favoriteToolIds)
  const toggleFavorite = useAppStore((state) => state.toggleFavoriteTool)

  if (!tool) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="mac-icon-tile h-12 w-12">
          <Home className="h-5 w-5" strokeWidth={1.6} />
        </div>
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-mac-label">Tool not found</h2>
          <p className="mt-1 max-w-sm text-[13px] text-mac-label-secondary">
            This tool may have been renamed or removed.
          </p>
        </div>
        <Link to="/" className="mac-btn-primary">
          Back to Home
        </Link>
      </div>
    )
  }

  const Component = tool.component
  const Icon = tool.icon
  const groupName = toolGroups.find((g) => g.id === tool.group)?.name ?? tool.group
  const pinned = favorites.includes(tool.id)
  const full = !pinned && favorites.length >= MAX_FAVORITE_TOOLS

  return (
    <div className="flex h-full min-w-0 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-mac-separator bg-mac-bg px-3 py-3 sm:px-5">
        <Link to="/" aria-label="All tools" title="Back to all tools" className="mac-btn-ghost h-9 w-9 shrink-0 !p-0"><ArrowLeft className="h-4 w-4" aria-hidden="true" /></Link>
        <div className="mac-icon-tile-accent h-9 w-9">
          <Icon className="h-4 w-4" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="break-words text-[18px] font-semibold leading-tight tracking-tight text-mac-label">
              {tool.name}
            </h1>
            <span className="mac-chip">{groupName}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-mac-label-secondary" title={tool.description}>{tool.description}</p>
        </div>
        <button type="button" className="mac-btn-ghost h-9 w-9 shrink-0 !p-0" aria-pressed={pinned} aria-label={`${pinned ? 'Unpin' : 'Pin'} ${tool.name}`} title={full ? `You can pin ${MAX_FAVORITE_TOOLS} tools. Unpin one to add another.` : `${pinned ? 'Remove from' : 'Add to'} Favorites`} disabled={full} onClick={() => toggleFavorite(tool.id)}><Star className={`h-4 w-4 ${pinned ? 'fill-mac-accent text-mac-accent' : ''}`} aria-hidden="true" /></button>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
        <Suspense fallback={<LoadingState label={`Loading ${tool.name}…`} />}>
          <Component />
        </Suspense>
      </div>
    </div>
  )
}
