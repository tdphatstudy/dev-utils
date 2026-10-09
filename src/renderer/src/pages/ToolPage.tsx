import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { Suspense, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getToolById, toolGroups } from '@renderer/registry/tools'
import { LoadingState } from '@renderer/components/ui/LoadingState'
import { Home, ArrowLeft, Star, CircleHelp } from 'lucide-react'
import { useAppStore } from '@renderer/store/app-store'
import { MAX_FAVORITE_TOOLS } from '@renderer/store/app-preferences'
import { isSecurityToolId } from '@shared/security-testing/types'
import { SecurityConsentGate } from '@renderer/components/SecurityConsentGate'
import { ToolGuide } from '@renderer/components/ui/ToolGuide'
import { useI18n } from '@renderer/i18n'

export function ToolPage(): JSX.Element {
  const { t } = useI18n()
  const [guideTool, setGuideTool] = useState<string | null>(null)
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
          <h2 className="text-[15px] font-semibold tracking-tight text-mac-label">{uiText('Tool not found')}</h2>
          <p className="mt-1 max-w-sm text-[13px] text-mac-label-secondary">
            {uiText('This tool may have been renamed or removed.')}</p>
        </div>
        <Link to="/" className="mac-btn-primary">
          {uiText('Back to Home')}</Link>
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
        <Link to="/" aria-label={uiText('All tools')} title={uiText('All tools')} className="mac-btn-ghost h-9 w-9 shrink-0 !p-0"><ArrowLeft className="h-4 w-4" aria-hidden="true" /></Link>
        <div className="mac-icon-tile-accent h-9 w-9">
          <Icon className="h-4 w-4" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="break-words text-[18px] font-semibold leading-tight tracking-tight text-mac-label">
              {t(tool.name)}
            </h1>
            <span className="mac-chip">{t(groupName)}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-mac-label-secondary" title={t(tool.description)}>{t(tool.description)}</p>
        </div>
        {tool.group !== 'app' && <button type="button" className="mac-btn-secondary h-9 shrink-0 !px-2.5" aria-label={t('How to use')} title={t('How to use')} aria-controls={`tool-guide-${tool.id}`} aria-expanded={guideTool === tool.id} onClick={() => setGuideTool(guideTool === tool.id ? null : tool.id)}><CircleHelp className="h-4 w-4" aria-hidden /><span className="hidden md:inline">{t('How to use')}</span></button>}
        <button type="button" className="mac-btn-ghost h-9 w-9 shrink-0 !p-0" aria-pressed={pinned} aria-label={t(pinned ? 'Remove {tool} from favorites' : 'Add {tool} to favorites', { tool: t(tool.name) })} title={full ? t('Favorites limit reached ({count}). Remove a favorite to add another.', { count: MAX_FAVORITE_TOOLS }) : t(pinned ? 'Remove from favorites' : 'Add to favorites')} disabled={full} onClick={() => toggleFavorite(tool.id)}><Star className={`h-4 w-4 ${pinned ? 'fill-mac-accent text-mac-accent' : ''}`} aria-hidden="true" /></button>
      </header>
      {guideTool === tool.id && <ToolGuide tool={tool} />}
      <div className="min-h-0 flex-1 overflow-hidden">
        <SecurityToolBoundary key={tool.id} id={tool.id}><Suspense key={tool.id} fallback={<LoadingState label={t('Opening {tool}…', { tool: t(tool.name) })} slowDetail={uiText('This is taking longer than usual.')} action={<Link to="/" className="mac-btn-secondary">{t('All tools')}</Link>} />}>
          <div key={tool.id} className="mac-page-enter h-full min-h-0" data-tool-ready={tool.id}>
            <div role="status" aria-live="polite" className="sr-only">{t('{tool} ready', { tool: t(tool.name) })}</div>
            <Component />
          </div>
        </Suspense></SecurityToolBoundary>
      </div>
    </div>
  )
}

function SecurityToolBoundary({ id, children }: { id: string; children: React.ReactNode }): JSX.Element {
  useUiLocale()
  return isSecurityToolId(id) ? <SecurityConsentGate id={id}>{children}</SecurityConsentGate> : <>{children}</>
}
