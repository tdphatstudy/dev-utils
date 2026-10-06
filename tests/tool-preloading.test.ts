import { describe, expect, it, vi } from 'vitest'
import { createToolLoader } from '../src/renderer/src/registry/tool-loader'
import { startToolPreloading, type IdleScheduler, type PreloadProgress } from '../src/renderer/src/lib/tool-preloading'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function idleQueue() {
  const jobs = new Set<() => void>()
  const schedule: IdleScheduler = (job) => {
    jobs.add(job)
    return () => { jobs.delete(job) }
  }
  return {
    schedule,
    size: () => jobs.size,
    run: () => {
      const job = jobs.values().next().value
      if (job) { jobs.delete(job); job() }
    }
  }
}

describe('shared tool imports', () => {
  it('does no work until requested, shares in-flight imports and never mounts a tool', async () => {
    const result = deferred<{ default: () => null }>()
    const render = vi.fn(() => null)
    const factory = vi.fn(() => result.promise)
    const loader = createToolLoader(factory)
    expect(factory).not.toHaveBeenCalled()
    expect(loader.isLoaded()).toBe(false)
    const first = loader.preload()
    const second = loader.preload()
    await Promise.resolve()
    expect(factory).toHaveBeenCalledTimes(1)
    result.resolve({ default: render })
    await Promise.all([first, second])
    await loader.preload()
    expect(loader.isLoaded()).toBe(true)
    expect(factory).toHaveBeenCalledTimes(1)
    expect(render).not.toHaveBeenCalled()
  })

  it('contains failed preparation and allows a subsequent attempt', async () => {
    const factory = vi.fn().mockRejectedValueOnce(new Error('missing chunk')).mockResolvedValue({ default: () => null })
    const loader = createToolLoader(factory)
    await expect(loader.preload()).rejects.toThrow('missing chunk')
    expect(loader.isLoaded()).toBe(false)
    await loader.preload()
    expect(loader.isLoaded()).toBe(true)
    expect(factory).toHaveBeenCalledTimes(2)
  })

  it('converts a synchronous loader failure into a rejected promise', async () => {
    const loader = createToolLoader(() => { throw new Error('loader failed') })
    await expect(loader.preload()).rejects.toThrow('loader failed')
  })
})

describe('idle tool preparation', () => {
  it('skips loaded tools and prepares one module per idle turn, serially', async () => {
    const idle = idleQueue()
    const pending = deferred<{ default: () => null }>()
    const ready = createToolLoader(async () => ({ default: () => null }))
    await ready.preload()
    const first = createToolLoader(() => pending.promise)
    const secondFactory = vi.fn(async () => ({ default: () => null }))
    const second = createToolLoader(secondFactory)
    const changes: PreloadProgress[] = []
    const controller = startToolPreloading([ready, first, second], idle.schedule, (progress) => changes.push(progress))
    expect(changes.at(-1)).toMatchObject({ prepared: 1, total: 3, phase: 'preparing' })
    idle.run()
    await Promise.resolve()
    expect(idle.size()).toBe(0)
    expect(secondFactory).not.toHaveBeenCalled()
    pending.resolve({ default: () => null })
    await vi.waitFor(() => expect(idle.size()).toBe(1))
    expect(secondFactory).not.toHaveBeenCalled()
    idle.run()
    await vi.waitFor(() => expect(changes.at(-1)).toEqual({ prepared: 3, total: 3, failed: 0, phase: 'ready' }))
    expect(idle.size()).toBe(0)
    controller.stop()
  })

  it('cancels queued work and is safe to restart after StrictMode cleanup', async () => {
    const idle = idleQueue()
    const factory = vi.fn(async () => ({ default: () => null }))
    const target = createToolLoader(factory)
    const publish = vi.fn()
    const first = startToolPreloading([target], idle.schedule, publish)
    first.stop()
    idle.run()
    expect(factory).not.toHaveBeenCalled()
    const second = startToolPreloading([target], idle.schedule, publish)
    idle.run()
    await vi.waitFor(() => expect(target.isLoaded()).toBe(true))
    expect(factory).toHaveBeenCalledTimes(1)
    second.stop()
  })

  it('stops follow-up work and progress updates after an in-flight import completes', async () => {
    const idle = idleQueue()
    const pending = deferred<{ default: () => null }>()
    const first = createToolLoader(() => pending.promise)
    const next = vi.fn(async () => ({ default: () => null }))
    const changes = vi.fn()
    const controller = startToolPreloading([first, createToolLoader(next)], idle.schedule, changes)
    idle.run()
    await Promise.resolve()
    controller.stop()
    const calls = changes.mock.calls.length
    pending.resolve({ default: () => null })
    await vi.waitFor(() => expect(first.isLoaded()).toBe(true))
    expect(idle.size()).toBe(0)
    expect(changes).toHaveBeenCalledTimes(calls)
    expect(next).not.toHaveBeenCalled()
    controller.resume()
    expect(idle.size()).toBe(0)
  })

  it('pauses in a hidden window, resumes explicitly and cancels queued work on pause', async () => {
    const idle = idleQueue()
    const target = createToolLoader(async () => ({ default: () => null }))
    const changes = vi.fn()
    const controller = startToolPreloading([target], idle.schedule, changes, true)
    expect(idle.size()).toBe(0)
    expect(changes.mock.lastCall?.[0].phase).toBe('paused')
    controller.resume()
    expect(idle.size()).toBe(1)
    controller.pause()
    expect(idle.size()).toBe(0)
    controller.resume()
    controller.resume()
    expect(idle.size()).toBe(1)
    idle.run()
    await vi.waitFor(() => expect(changes.mock.lastCall?.[0].phase).toBe('ready'))
    controller.stop()
  })

  it('allows an in-flight import to finish during pause without starting another', async () => {
    const idle = idleQueue()
    const pending = deferred<{ default: () => null }>()
    const first = createToolLoader(() => pending.promise)
    const second = createToolLoader(async () => ({ default: () => null }))
    const changes = vi.fn()
    const controller = startToolPreloading([first, second], idle.schedule, changes)
    idle.run()
    controller.pause()
    pending.resolve({ default: () => null })
    await vi.waitFor(() => expect(changes.mock.lastCall?.[0]).toMatchObject({ phase: 'paused', prepared: 1 }))
    expect(idle.size()).toBe(0)
    controller.resume()
    idle.run()
    await vi.waitFor(() => expect(changes.mock.lastCall?.[0].phase).toBe('ready'))
    controller.stop()
  })

  it('continues after a failed chunk and reports partial preparation honestly without retry loops', async () => {
    const idle = idleQueue()
    const badFactory = vi.fn(async () => { throw new Error('offline chunk') })
    const bad = createToolLoader(badFactory)
    const good = createToolLoader(async () => ({ default: () => null }))
    const changes = vi.fn()
    const controller = startToolPreloading([bad, good], idle.schedule, changes)
    idle.run()
    await vi.waitFor(() => expect(idle.size()).toBe(1))
    idle.run()
    await vi.waitFor(() => expect(changes.mock.lastCall?.[0]).toEqual({ phase: 'partial', prepared: 1, total: 2, failed: 1 }))
    controller.pause()
    controller.resume()
    expect(idle.size()).toBe(0)
    expect(badFactory).toHaveBeenCalledTimes(1)
    controller.stop()
  })
})