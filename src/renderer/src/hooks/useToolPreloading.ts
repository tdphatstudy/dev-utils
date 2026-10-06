import { useEffect } from 'react'
import { tools } from '../registry/tools'
import { useAppStore } from '../store/app-store'
import { useToolPreloadStore } from '../store/tool-preload-store'
import { startToolPreloading, type IdleScheduler } from '../lib/tool-preloading'

const scheduleIdle: IdleScheduler = (callback) => {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(() => callback())
    return () => window.cancelIdleCallback(id)
  }
  const id = window.setTimeout(callback, 250)
  return () => window.clearTimeout(id)
}

export function useToolPreloading(): void {
  const mode = useAppStore((state) => state.toolLoadingMode)
  useEffect(() => {
    const publish = useToolPreloadStore.getState().setProgress
    if (mode === 'on-demand') {
      publish({ phase: 'idle', prepared: tools.filter((tool) => tool.isLoaded()).length, total: tools.length, failed: 0 })
      return
    }
    const controller = startToolPreloading(tools, scheduleIdle, publish, document.hidden)
    const onVisibility = (): void => {
      if (document.hidden) controller.pause()
      else controller.resume()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      controller.stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [mode])
}