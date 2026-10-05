/**
 * Global error feedback helpers. Async failures leave the current view intact.
 * Crash history contains a generic notice, never exception text or tool content.
 */

export interface CrashReport {
  message: string
  source: string
  stack?: string
  at: number
}

const STORAGE_KEY = 'devutils-last-error'

export function formatError(error: unknown): string {
  if (error instanceof Error) return error.message || error.name
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

export function saveCrashReport(report: CrashReport): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      message: 'A tool or page could not be displayed.',
      source: report.source === 'ErrorBoundary:app' ? 'ErrorBoundary:app' : 'ErrorBoundary:route',
      at: report.at
    }))
  } catch {
    /* ignore quota / private mode */
  }
}

export function consumeCrashReport(): CrashReport | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    sessionStorage.removeItem(STORAGE_KEY)
    return JSON.parse(raw) as CrashReport
  } catch {
    return null
  }
}

export function peekCrashReport(): CrashReport | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as CrashReport
  } catch {
    return null
  }
}

export function clearCrashReport(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

function isBenign(error: unknown, messageHint = ''): boolean {
  const msg = `${messageHint} ${formatError(error)}`.toLowerCase()
  if (msg.includes('resizeobserver')) return true
  if (msg.includes('aborted') || msg.includes('aborterror')) return true
  // Script load cancelled when navigating away
  if (msg.includes('loading chunk') && msg.includes('failed')) return false
  if (error && typeof error === 'object' && 'name' in error) {
    const name = String((error as { name?: string }).name)
    if (name === 'AbortError' || name === 'NotAllowedError') return true
  }
  return false
}

/**
 * Report uncaught errors & promise rejections without navigating or recording payloads.
 * Call once from the app root.
 */
export function installGlobalErrorGuards(onFailure: () => void = () => undefined): () => void {
  const onError = (event: ErrorEvent): void => {
    // Ignore ResizeObserver noise and cross-origin script errors without detail
    if (!event.message && !event.error) return
    if (isBenign(event.error, event.message ?? '')) return

    console.error('[DevFusion] window.error: an action failed')
    onFailure()
  }

  const onRejection = (event: PromiseRejectionEvent): void => {
    if (isBenign(event.reason)) return
    console.error('[DevFusion] unhandledrejection: an action failed')
    onFailure()
  }

  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)

  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
  }
}
