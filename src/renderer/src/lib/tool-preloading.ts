export interface PreloadTarget {
  preload: () => Promise<void>
  isLoaded: () => boolean
}

export interface PreloadProgress {
  phase: 'idle' | 'preparing' | 'paused' | 'ready' | 'partial'
  prepared: number
  total: number
  failed: number
}

export type IdleScheduler = (callback: () => void) => () => void

/** One import at a time. Cancellation stops future work, not an in-flight import. */
export function startToolPreloading(
  targets: readonly PreloadTarget[],
  schedule: IdleScheduler,
  onProgress: (progress: PreloadProgress) => void,
  initiallyPaused = false
): { pause: () => void; resume: () => void; stop: () => void } {
  const attempted = new Set<PreloadTarget>()
  const failed = new Set<PreloadTarget>()
  let stopped = false
  let paused = initiallyPaused
  let inFlight = false
  let cancelScheduled: (() => void) | undefined

  const publish = (): void => {
    if (stopped) return
    const prepared = targets.filter((target) => target.isLoaded()).length
    const remaining = targets.some((target) => !target.isLoaded() && !attempted.has(target))
    const failures = [...failed].filter((target) => !target.isLoaded()).length
    onProgress({
      phase: !remaining && !inFlight ? failures ? 'partial' : 'ready' : paused ? 'paused' : 'preparing',
      prepared,
      total: targets.length,
      failed: failures
    })
  }
  const queue = (): void => {
    publish()
    if (stopped || paused || inFlight || cancelScheduled) return
    if (!targets.some((target) => !target.isLoaded() && !attempted.has(target))) return
    cancelScheduled = schedule(() => {
      cancelScheduled = undefined
      if (stopped || paused) return
      const target = targets.find((item) => !item.isLoaded() && !attempted.has(item))
      if (!target) { publish(); return }
      attempted.add(target)
      inFlight = true
      void Promise.resolve().then(target.preload).catch(() => {
        failed.add(target)
      }).finally(() => {
        inFlight = false
        queue()
      })
    })
  }
  queue()
  return {
    pause: () => {
      if (stopped) return
      paused = true
      cancelScheduled?.()
      cancelScheduled = undefined
      publish()
    },
    resume: () => {
      if (stopped) return
      paused = false
      queue()
    },
    stop: () => {
      stopped = true
      cancelScheduled?.()
      cancelScheduled = undefined
    }
  }
}