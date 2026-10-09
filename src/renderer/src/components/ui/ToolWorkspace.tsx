import { t as uiText } from '@renderer/i18n'
import { useEffect, useState, type ReactNode } from 'react'
import { ArrowRight, FileSearch, LoaderCircle, ShieldCheck, ChevronDown } from 'lucide-react'
import { useI18n } from '@renderer/i18n'
import { SplitPane } from './SplitPane'
import { ToolToolbar } from './ToolToolbar'

export interface ToolWorkspaceProps {
  purpose: string
  toolbar: ReactNode
  input: ReactNode
  children: ReactNode
  details?: ReactNode
  busy?: boolean
  hasResult?: boolean
  error?: string | null
  network?: boolean
}

/** Keep actions reachable while long inputs and reports scroll independently. */
export function ToolWorkspace({ purpose, toolbar, input, children, details, busy = false, hasResult = false, error, network = false }: ToolWorkspaceProps): JSX.Element {
  const { t } = useI18n()
  const [pane, setPane] = useState<0 | 1>(0)
  useEffect(() => { setPane(hasResult || busy || error ? 1 : 0) }, [hasResult, busy, error])
  return <div className="flex h-full min-h-0 flex-col">
    <ToolToolbar label={uiText('Tool actions')}>{toolbar}</ToolToolbar>
    <SplitPane labels={[uiText('Input'), uiText('Results')]} activePane={pane} onPaneChange={setPane}>
      <div className="flex h-full min-h-0 flex-col overflow-auto rounded-mac-lg border border-mac-separator bg-mac-surface">
        <div className="border-b border-mac-separator px-4 py-3 text-[13px] leading-relaxed text-mac-label-secondary">{t(purpose)}</div>
        <div className="min-w-0 space-y-4 p-3 sm:p-4">{input}
          {details && <details className="group border-t border-mac-separator pt-3">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-[12px] font-medium text-mac-label-secondary [&::-webkit-details-marker]:hidden"><ChevronDown aria-hidden className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />{t('Details and limits')}</summary>
            <div className="mt-3 space-y-3 text-[12px] leading-relaxed text-mac-label-secondary">{details}</div>
          </details>}
        </div>
      </div>
      <div className="h-full min-w-0 space-y-3 overflow-auto">
        {error && <p role="alert" className="rounded-mac-lg border border-mac-danger/30 bg-mac-danger/10 p-4 text-[13px] text-mac-danger">{t(error)}</p>}
        {hasResult ? children : <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-3 rounded-mac-lg border border-mac-separator bg-mac-surface p-6 text-center">
          {busy ? <LoaderCircle aria-hidden className="h-7 w-7 animate-spin text-mac-accent motion-reduce:animate-none" /> : <FileSearch aria-hidden className="h-8 w-8 text-mac-label-tertiary" />}
          <p className="text-[14px] font-semibold">{t(busy ? 'Working…' : 'No results yet')}</p>
          <p className="max-w-xs text-[13px] leading-relaxed text-mac-label-secondary">{t(busy ? 'You can stop this operation at any time.' : 'Add your input, then use the action above to see results here.')}</p>
          {!busy && <ArrowRight aria-hidden className="h-4 w-4 text-mac-label-tertiary" />}
        </div>}
      </div>
    </SplitPane>
    <div className="flex shrink-0 items-center gap-2 border-t border-mac-separator px-4 py-2 text-[11px] text-mac-label-secondary"><ShieldCheck aria-hidden className="h-3.5 w-3.5 shrink-0" />{t(network ? 'Requests run only when you start. Inputs are cleared when you leave.' : 'Processed on your device. Inputs are cleared when you leave.')}</div>
  </div>
}
