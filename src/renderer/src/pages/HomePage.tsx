import { Navigate } from 'react-router-dom'
import { useAppStore } from '@renderer/store/app-store'
import { tools } from '@renderer/registry/tools'

export function HomePage(): JSX.Element {
  const lastToolId = useAppStore((s) => s.lastToolId)
  const target = lastToolId && tools.some((t) => t.id === lastToolId) ? lastToolId : tools[0]?.id

  return <Navigate to={target ? `/tool/${target}` : '/tool/json.studio'} replace />
}
