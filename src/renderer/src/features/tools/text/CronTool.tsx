import { useMemo, useState } from 'react'
import {
  CRON_PRESETS,
  cronToJson,
  formatCronDate,
  nextRuns,
  parseCron
} from '@shared/cron'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import { useToolDraft } from '@renderer/hooks/useToolDraft'
import { cn } from '@renderer/lib/utils'

export default function CronTool(): JSX.Element {
  const [expr, setExpr] = useState('*/5 9-17 * * 1-5')
  const [count, setCount] = useState(10)
  useToolDraft('text.cron', expr, setExpr, { label: 'Cron', historyOnUnmount: true })

  const parsed = useMemo(() => parseCron(expr), [expr])
  const runs = useMemo(() => {
    if (!parsed.ok) return []
    return nextRuns(parsed, new Date(), Math.min(50, Math.max(1, count)))
  }, [parsed, count])

  const jsonOut = useMemo(() => {
    if (!parsed.ok) return ''
    return cronToJson(parsed, runs)
  }, [parsed, runs])

  const tz =
    typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : 'local'

  return (
    <div className="flex h-full flex-col">
      <ToolToolbar>
        <span className="text-[12px] text-mac-label-tertiary">
          5-field (min hour dom mon dow) or 6-field with seconds · timezone: {tz}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[12px] text-mac-label-secondary">
            Next
            <input
              type="number"
              min={1}
              max={50}
              className="mac-input !w-16 !py-1 text-center font-mono"
              value={count}
              onChange={(e) => setCount(Number(e.target.value) || 10)}
            />
          </label>
          <CopyButton text={parsed.ok ? expr : ''} label="Copy expr" />
          <CopyButton text={jsonOut} label="Copy JSON" />
        </div>
      </ToolToolbar>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-[1fr_1fr]">
        {/* Left: editor + presets */}
        <div className="flex min-h-0 flex-col border-b border-mac-separator lg:border-b-0 lg:border-r">
          <div className="space-y-3 p-4">
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-mac-label-tertiary">
              Expression
            </label>
            <input
              className="mac-input font-mono text-[16px] tracking-wide"
              value={expr}
              onChange={(e) => setExpr(e.target.value)}
              spellCheck={false}
              placeholder="* * * * *"
            />
            {parsed.ok ? (
              <p className="text-[13px] leading-relaxed text-mac-label">{parsed.human}</p>
            ) : (
              <p className="text-[13px] text-mac-danger">{parsed.error}</p>
            )}

            {/* Field legend */}
            <div className="flex flex-wrap gap-1.5 font-mono text-[11px] text-mac-label-tertiary">
              {(parsed.ok && parsed.hasSeconds
                ? ['sec', 'min', 'hour', 'dom', 'mon', 'dow']
                : ['min', 'hour', 'dom', 'mon', 'dow']
              ).map((f) => (
                <span
                  key={f}
                  className="rounded-mac bg-mac-control px-2 py-0.5 text-mac-label-secondary"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto border-t border-mac-separator p-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-mac-label-tertiary">
              Presets
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {CRON_PRESETS.map((p) => (
                <button
                  key={p.expr + p.label}
                  type="button"
                  onClick={() => setExpr(p.expr)}
                  className={cn(
                    'rounded-mac border border-mac-separator px-3 py-2 text-left transition-colors hover:bg-mac-control/60',
                    expr === p.expr && 'border-mac-accent/40 bg-mac-accent-soft'
                  )}
                >
                  <div className="text-[12px] font-medium text-mac-label">{p.label}</div>
                  <div className="mt-0.5 font-mono text-[11px] text-mac-accent">{p.expr}</div>
                  <div className="mt-0.5 text-[10px] text-mac-label-tertiary">{p.hint}</div>
                </button>
              ))}
            </div>

            <div className="mt-5 rounded-mac border border-mac-separator bg-mac-control/30 p-3 text-[11px] leading-relaxed text-mac-label-secondary">
              <div className="mb-1 font-semibold text-mac-label">Syntax</div>
              <ul className="list-inside list-disc space-y-0.5">
                <li>
                  <code className="font-mono text-mac-label">*</code> any ·{' '}
                  <code className="font-mono">*/n</code> step ·{' '}
                  <code className="font-mono">a-b</code> range ·{' '}
                  <code className="font-mono">a,b</code> list
                </li>
                <li>
                  Months: <code className="font-mono">JAN</code>–
                  <code className="font-mono">DEC</code> · DOW:{' '}
                  <code className="font-mono">SUN</code>–
                  <code className="font-mono">SAT</code> (0 or 7 = Sun)
                </li>
                <li>
                  DOM + DOW both set → match if <strong>either</strong> matches (classic cron)
                </li>
                <li>
                  <code className="font-mono">?</code> allowed on DOM/DOW (same as *)
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Right: fields + next runs */}
        <div className="flex min-h-0 flex-col overflow-auto p-4">
          {parsed.ok && (
            <>
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-mac-label-tertiary">
                Field breakdown
              </div>
              <div className="mb-5 space-y-2">
                {parsed.fields.map((f) => (
                  <div
                    key={f.name}
                    className="grid grid-cols-[120px_64px_1fr] items-start gap-2 rounded-mac border border-mac-separator bg-mac-surface px-3 py-2 text-[12px]"
                  >
                    <span className="font-medium text-mac-label">{f.label}</span>
                    <code className="font-mono text-mac-accent">{f.raw}</code>
                    <span className="text-mac-label-secondary">{f.description}</span>
                  </div>
                ))}
              </div>

              <div className="mb-2 flex items-center justify-between">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-mac-label-tertiary">
                  Next {runs.length} runs (local)
                </div>
              </div>
              {runs.length === 0 ? (
                <p className="text-[13px] text-mac-warning">
                  No runs found in the next ~2 years — check the expression.
                </p>
              ) : (
                <ol className="space-y-1">
                  {runs.map((d, i) => (
                    <li
                      key={d.toISOString() + i}
                      className="flex items-center gap-3 rounded-mac px-2 py-1.5 font-mono text-[12px] hover:bg-mac-control/50"
                    >
                      <span className="w-6 text-mac-label-tertiary">{i + 1}.</span>
                      <span className="text-mac-label">{formatCronDate(d)}</span>
                      <span className="ml-auto text-[10px] text-mac-label-tertiary">
                        {d.toISOString()}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>
      </div>

      <footer className="flex items-center border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={parsed.ok ? 'success' : 'danger'}>
          {parsed.ok
            ? `${parsed.hasSeconds ? '6-field' : '5-field'} · ${runs.length} upcoming`
            : parsed.error}
        </ToolStatus>
      </footer>
    </div>
  )
}
