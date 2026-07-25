import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { clearCrashReport, consumeCrashReport, type CrashReport } from '@renderer/lib/error-guard'

/** Shows the last crash message once on Home after recovery. */
export function CrashBanner(): JSX.Element | null {
  const [report, setReport] = useState<CrashReport | null>(null)

  useEffect(() => {
    setReport(consumeCrashReport())
  }, [])

  if (!report) return null

  return (
    <div className="mb-6 flex items-start gap-3 rounded-mac-lg border border-mac-danger/25 bg-mac-danger/10 px-4 py-3 text-left">
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-semibold text-mac-danger">Recovered from an error</div>
        <p className="mt-0.5 break-words font-mono text-[11px] text-mac-label-secondary">
          {report.message}
        </p>
        <p className="mt-1 text-[10px] text-mac-label-tertiary">
          {report.source}
          {report.at ? ` · ${new Date(report.at).toLocaleTimeString()}` : ''}
        </p>
      </div>
      <button
        type="button"
        className="mac-btn-ghost !p-1"
        title="Dismiss"
        onClick={() => {
          clearCrashReport()
          setReport(null)
        }}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
