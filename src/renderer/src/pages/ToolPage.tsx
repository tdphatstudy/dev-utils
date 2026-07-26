import { Suspense } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getToolById, toolGroups } from '@renderer/registry/tools'
import { LoadingState } from '@renderer/components/ui/LoadingState'
import { Home } from 'lucide-react'

export function ToolPage(): JSX.Element {
  const { toolId } = useParams()
  const tool = toolId ? getToolById(toolId) : undefined

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

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-mac-separator bg-mac-bg px-4 py-2.5 sm:px-5">
        <div className="mac-icon-tile-accent h-9 w-9">
          <Icon className="h-4 w-4" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-[15px] font-semibold tracking-tight text-mac-label">
              {tool.name}
            </h1>
            <span className="mac-chip">{groupName}</span>
          </div>
          <p className="mt-0.5 truncate text-[12px] text-mac-label-secondary">{tool.description}</p>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
        <Suspense fallback={<LoadingState label="Loading tool…" />}>
          <Component />
        </Suspense>
      </div>
    </div>
  )
}
