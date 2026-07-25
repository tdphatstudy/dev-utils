import { Suspense } from 'react'
import { useParams } from 'react-router-dom'
import { getToolById } from '@renderer/registry/tools'

export function ToolPage(): JSX.Element {
  const { toolId } = useParams()
  const tool = toolId ? getToolById(toolId) : undefined

  if (!tool) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-mac-label-secondary">
        Tool not found
      </div>
    )
  }

  const Component = tool.component

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-mac-separator px-5 py-3">
        <div>
          <h1 className="text-[15px] font-semibold tracking-tight text-mac-label">{tool.name}</h1>
          <p className="mt-0.5 text-[12px] text-mac-label-secondary">{tool.description}</p>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-[13px] text-mac-label-tertiary">
              Loading…
            </div>
          }
        >
          <Component />
        </Suspense>
      </div>
    </div>
  )
}
