import { t as uiText } from '@renderer/i18n'
import { Component, type ReactNode } from 'react'
import { AlertTriangle, Home, RotateCcw } from 'lucide-react'
import { saveCrashReport } from '@renderer/lib/error-guard'

interface Props {
  children: ReactNode
  /** Isolate tool pane only (keeps shell chrome). */
  scope?: 'app' | 'route'
  onHome: () => void
  homeLabel?: string
}

interface State {
  error: Error | null
}

/**
 * React class boundary — catches render/lifecycle crashes in the subtree.
 * Window-level async errors are handled by installGlobalErrorGuards().
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(): void {
    const source = `ErrorBoundary:${this.props.scope ?? 'app'}`
    console.error(`[DevFusion] ${source}: render failed`)
    saveCrashReport({
      message: 'A tool or page could not be displayed.',
      source,
      at: Date.now()
    })
  }

  private reset = (): void => {
    this.setState({ error: null })
  }

  private goHome = (): void => {
    this.setState({ error: null })
    this.props.onHome()
  }

  private retry = (): void => {
    this.reset()
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    const loadFailure = /dynamically imported module|importing a module script|loading chunk|unable to preload css/i.test(error.message)

    return (
      <div className="flex h-full min-h-[200px] w-full flex-col items-center justify-center gap-4 bg-mac-bg p-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-mac-danger/10 text-mac-danger shadow-[var(--mac-shadow-sm)]">
          <AlertTriangle className="h-7 w-7" strokeWidth={1.6} />
        </div>
        <div className="max-w-md">
          <h2 className="text-[16px] font-semibold tracking-tight text-mac-label">
            {loadFailure ? uiText('This tool could not be loaded') : uiText('Something went wrong')}
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-mac-label-secondary">
            {loadFailure
              ? 'The tool files could not be opened. Return to the toolbox. If this continues, save your work and reopen DevFusion.'
              : uiText('This view could not be displayed. Try again, or return to the toolbox.')}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {!loadFailure && <button type="button" className="mac-btn-secondary" onClick={this.retry}>
            <RotateCcw className="h-3.5 w-3.5" />
            {uiText('Try again')}</button>}
          <button type="button" className="mac-btn-primary" onClick={this.goHome}>
            <Home className="h-3.5 w-3.5" />
            {this.props.homeLabel ?? 'Back to Home'}
          </button>
        </div>
      </div>
    )
  }
}
