/**
 * Global crash / exception recovery helpers.
 * Navigates to Home (HashRouter) and stores a short message for the banner.
 */

export interface CrashReport {
  message: string
  source: string
  stack?: string
  at: number
}

const STORAGE_KEY = 'devutils-last-error'
const COOLDOWN_MS = 2500

let lastRedirectAt = 0

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
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(report))
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

/** True when we are already on the home hash route. */
export function isOnHomeRoute(): boolean {
  const h = window.location.hash.replace(/^#/, '') || '/'
  return h === '/' || h === ''
}

/**
 * Record a fatal error and bounce to Home (unless already there / cooldown).
 * Returns true if a redirect was triggered.
 */
export function recoverToHome(
  error: unknown,
  source: string,
  options?: { force?: boolean }
): boolean {
  const message = formatError(error)
  const stack = error instanceof Error ? error.stack : undefined

  console.error(`[DevUtils] ${source}:`, error)

  saveCrashReport({
    message,
    source,
    stack,
    at: Date.now()
  })

  if (isOnHomeRoute() && !options?.force) return false

  const now = Date.now()
  if (!options?.force && now - lastRedirectAt < COOLDOWN_MS) return false
  lastRedirectAt = now

  // HashRouter — hard navigation resets React tree cleanly after a crash
  window.location.hash = '#/'
  return true
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
 * Install window-level guards for uncaught errors & promise rejections.
 * Call once from the app root.
 */
export function installGlobalErrorGuards(): () => void {
  const onError = (event: ErrorEvent): void => {
    // Ignore ResizeObserver noise and cross-origin script errors without detail
    if (!event.message && !event.error) return
    if (isBenign(event.error, event.message ?? '')) return

    recoverToHome(event.error ?? event.message, 'window.error')
  }

  const onRejection = (event: PromiseRejectionEvent): void => {
    if (isBenign(event.reason)) return
    recoverToHome(event.reason, 'unhandledrejection')
  }

  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)

  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
  }
}
