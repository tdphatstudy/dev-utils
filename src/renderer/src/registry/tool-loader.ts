import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

export interface ToolLoader {
  component: LazyExoticComponent<ComponentType>
  preload: () => Promise<void>
  isLoaded: () => boolean
}

/** Share the same import between explicit preparation and React's first render. */
export function createToolLoader(factory: () => Promise<{ default: ComponentType }>): ToolLoader {
  let pending: Promise<{ default: ComponentType }> | undefined
  let loaded = false
  const load = (): Promise<{ default: ComponentType }> => {
    pending ??= Promise.resolve().then(factory).then((module) => {
      loaded = true
      return module
    }).catch((error: unknown) => {
      pending = undefined
      throw error
    })
    return pending
  }
  return {
    component: lazy(load),
    preload: () => load().then(() => undefined),
    isLoaded: () => loaded
  }
}