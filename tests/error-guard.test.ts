import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installGlobalErrorGuards, saveCrashReport } from '../src/renderer/src/lib/error-guard'

let target: EventTarget & { location: { hash: string } }
let cleanup: () => void

beforeEach(() => {
  target = Object.assign(new EventTarget(), { location: { hash: '#/tool/privatebox.keep' } })
  vi.stubGlobal('window', target)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup?.()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function failure(type: string, properties: Record<string, unknown>): void {
  target.dispatchEvent(Object.assign(new Event(type), properties))
}

describe('async error feedback preserves the current tool', () => {
  it('reports error and rejection events without navigation or logging their payloads', () => {
    const feedback = vi.fn()
    const storage = { setItem: vi.fn() }
    vi.stubGlobal('sessionStorage', storage)
    cleanup = installGlobalErrorGuards(feedback)
    failure('error', { message: 'secret note text', error: new Error('secret note text') })
    failure('unhandledrejection', { reason: new Error('private request body') })
    expect(feedback).toHaveBeenCalledTimes(2)
    expect(target.location.hash).toBe('#/tool/privatebox.keep')
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(/secret note|private request/)
  })

  it('ignores cancellation, clipboard permissions and resize observer noise', () => {
    const feedback = vi.fn()
    cleanup = installGlobalErrorGuards(feedback)
    failure('unhandledrejection', { reason: Object.assign(new Error('cancelled'), { name: 'AbortError' }) })
    failure('unhandledrejection', { reason: Object.assign(new Error('clipboard denied'), { name: 'NotAllowedError' }) })
    failure('error', { message: 'ResizeObserver loop limit exceeded' })
    expect(feedback).not.toHaveBeenCalled()
  })

  it('removes both listeners on cleanup and still reports chunk load failures', () => {
    const feedback = vi.fn()
    cleanup = installGlobalErrorGuards(feedback)
    failure('unhandledrejection', { reason: new Error('Loading chunk 7 failed') })
    expect(feedback).toHaveBeenCalledOnce()
    cleanup()
    failure('unhandledrejection', { reason: new Error('failed again') })
    failure('error', { message: 'failed again' })
    expect(feedback).toHaveBeenCalledOnce()
  })

  it('never saves exception text, stack or arbitrary source names in crash history', () => {
    const storage = { setItem: vi.fn() }
    vi.stubGlobal('sessionStorage', storage)
    saveCrashReport({ message: 'private input', stack: 'private key', source: 'secret URL', at: 123 })
    expect(storage.setItem).toHaveBeenCalledWith('devutils-last-error', JSON.stringify({
      message: 'A tool or page could not be displayed.', source: 'ErrorBoundary:route', at: 123
    }))
  })
})
