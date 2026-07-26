import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, Home, RotateCcw } from 'lucide-react'
import { formatError, recoverToHome, saveCrashReport } from '@renderer/lib/error-guard'

interface Props {
  children: ReactNode
  /** Isolate tool pane only (keeps shell chrome). */
  scope?: 'app' | 'route'
  /** Auto-return to Home after N ms (default 0 = manual). */
  autoHomeMs?: number
}

interface State {
  error: Error | null
  info: string | null
}

/**
 * React class boundary — catches render/lifecycle crashes in the subtree.
 * Window-level async errors are handled by installGlobalErrorGuards().
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null }
  private autoTimer: ReturnType<typeof setTimeout> | null = null

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const source = `ErrorBoundary:${this.props.scope ?? 'app'}`
    console.error(`[DevUtils] ${source}`, error, info.componentStack)
    saveCrashReport({
      message: formatError(error),
      source,
      stack: [error.stack, info.componentStack].filter(Boolean).join('\n'),
      at: Date.now()
    })

    const ms = this.props.autoHomeMs ?? 0
    if (ms > 0) {
      this.autoTimer = setTimeout(() => this.goHome(), ms)
    }
  }

  componentWillUnmount(): void {
    if (this.autoTimer) clearTimeout(this.autoTimer)
  }

  private reset = (): void => {
    if (this.autoTimer) clearTimeout(this.autoTimer)
    this.setState({ error: null, info: null })
  }

  private goHome = (): void => {
    if (this.autoTimer) clearTimeout(this.autoTimer)
    this.setState({ error: null, info: null })
    recoverToHome(this.state.error ?? 'Unknown render error', `ErrorBoundary:${this.props.scope ?? 'app'}`, {
      force: true
    })
  }

  private retry = (): void => {
    this.reset()
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex h-full min-h-[200px] w-full flex-col items-center justify-center gap-4 bg-mac-bg p-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-mac-danger/10 text-mac-danger shadow-[var(--mac-shadow-sm)]">
          <AlertTriangle className="h-7 w-7" strokeWidth={1.6} />
        </div>
        <div className="max-w-md">
          <h2 className="text-[16px] font-semibold tracking-tight text-mac-label">
            Something went wrong
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-mac-label-secondary">
            A tool or page crashed. Retry or return to Home — the rest of the app is fine.
          </p>
          <pre className="mt-3 max-h-28 overflow-auto rounded-mac border border-mac-separator bg-mac-surface px-3 py-2 text-left font-mono text-[11px] text-mac-danger shadow-[var(--mac-shadow-sm)]">
            {error.message || String(error)}
          </pre>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button type="button" className="mac-btn-secondary" onClick={this.retry}>
            <RotateCcw className="h-3.5 w-3.5" />
            Try again
          </button>
          <button type="button" className="mac-btn-primary" onClick={this.goHome}>
            <Home className="h-3.5 w-3.5" />
            Back to Home
          </button>
        </div>
        {(this.props.autoHomeMs ?? 0) > 0 && (
          <p className="text-[11px] text-mac-label-tertiary">
            Returning to Home automatically…
          </p>
        )}
      </div>
    )
  }
}
