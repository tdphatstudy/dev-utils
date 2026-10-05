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
import { SaveToBoxButton } from '@renderer/features/secret-box/SaveToBoxButton'
import { cn } from '@renderer/lib/utils'
import { parseCronStart } from '@shared/cron/start-time'

export default function CronTool(): JSX.Element {
  const [expr, setExpr] = useState('*/5 9-17 * * 1-5')
  const [count, setCount] = useState(10)
  const [timezone, setTimezone] = useState<'local' | 'UTC'>('local')
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 19) + 'Z')
  const start = useMemo(() => parseCronStart(from), [from])
  const fromDate = start.ok ? start.date : null
  const fromValid = start.ok
  const countValid = Number.isInteger(count) && count >= 1 && count <= 50
  useToolDraft('text.cron', expr, setExpr, { label: 'Cron', historyOnUnmount: true })

  const parsed = useMemo(() => parseCron(expr), [expr])
  const runs = useMemo(() => {
    if (!parsed.ok || !fromDate || !countValid) return []
    return nextRuns(parsed, fromDate, count, { timezone })
  }, [parsed, count, fromDate, fromValid, countValid, timezone])

  const jsonOut = useMemo(() => {
    if (!parsed.ok || !fromDate || !countValid) return ''
    return JSON.stringify({ ...JSON.parse(cronToJson(parsed, runs)), timezone: timezone === 'UTC' ? 'UTC' : Intl.DateTimeFormat().resolvedOptions().timeZone, from: fromDate.toISOString(), searchHorizonYears: 8 }, null, 2)
  }, [parsed, runs, fromDate, fromValid, countValid, timezone])
  const error = !parsed.ok ? `${parsed.error}${parsed.column ? ` · column ${parsed.column}` : ''}` : !start.ok ? start.error : !countValid ? 'Next run count must be an integer from 1 to 50.' : null

  const tz =
    typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : 'local'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ToolToolbar>
        <span className="text-[12px] text-mac-label-tertiary">
          5-field cron or 6-field with seconds · {timezone === 'UTC' ? 'UTC' : tz}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[12px] text-mac-label-secondary">
            Next
            <input
              type="number"
              aria-invalid={!countValid}
              min={1}
              max={50}
              className="mac-input !w-16 !py-1 text-center font-mono"
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            />
          </label>
          <SaveToBoxButton type="json" content={jsonOut} disabled={!jsonOut} />
          <CopyButton text={parsed.ok ? expr : ''} label="Copy expr" />
          <CopyButton text={jsonOut} label="Copy JSON" />
        </div>
      </ToolToolbar>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-mac-separator px-4 py-2">
        <label className="text-[12px]" htmlFor="cron-zone">Timezone</label>
        <select id="cron-zone" className="mac-input !w-auto" value={timezone} onChange={(event) => setTimezone(event.target.value as 'local' | 'UTC')}><option value="local">Local ({tz})</option><option value="UTC">UTC</option></select>
        <label className="text-[12px]" htmlFor="cron-from">After</label>
        <input id="cron-from" aria-invalid={!fromValid} aria-describedby={!start.ok ? 'cron-start-error' : undefined} className="mac-input min-w-[240px] flex-1 font-mono text-[12px]" value={from} onChange={(event) => setFrom(event.target.value)} spellCheck={false} />
        <button type="button" className="mac-btn-secondary" onClick={() => setFrom(new Date().toISOString().slice(0, 19) + 'Z')}>Now</button>
        {!start.ok && <p id="cron-start-error" role="alert" className="w-full text-[12px] text-mac-danger">{start.error}</p>}
      </div>

      <div className="grid min-h-0 flex-1 auto-rows-[minmax(300px,1fr)] grid-cols-1 gap-0 overflow-auto lg:grid-cols-[1fr_1fr] lg:grid-rows-1">
        {/* Left: editor + presets */}
        <div className="flex min-h-0 flex-col border-b border-mac-separator lg:border-b-0 lg:border-r">
          <div className="space-y-3 p-4">
            <label htmlFor="cron-expression" className="block text-[11px] font-semibold uppercase tracking-wide text-mac-label-tertiary">
              Expression
            </label>
            <input
              id="cron-expression"
              aria-invalid={!parsed.ok}
              className="mac-input font-mono text-[16px] tracking-wide"
              value={expr}
              onChange={(e) => setExpr(e.target.value)}
              spellCheck={false}
              placeholder="* * * * *"
            />
            {parsed.ok ? (
              <p className="text-[13px] leading-relaxed text-mac-label">{parsed.human}</p>
            ) : (
              <p className="text-[13px] text-mac-danger" role="alert">{error}</p>
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
                <li>Supported subset: no Quartz L/W/#, year, command or @macros. DST previews follow wall time: missing times are skipped and repeated times appear twice. Check your scheduler’s own DST policy.</li>
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
                  Next {runs.length} runs ({timezone === 'UTC' ? 'UTC' : tz})
                </div>
              </div>
              {error ? <p role="alert" className="text-[13px] text-mac-danger">{error}</p> : runs.length === 0 ? (
                <p className="text-[13px] text-mac-warning">
                  No runs found within 8 years after the start time. The syntax is valid, but the date combination may be impossible.
                </p>
              ) : (
                <ol className="space-y-1">
                  {runs.map((d, i) => (
                    <li
                      key={d.toISOString() + i}
                      className="flex flex-wrap items-center gap-2 rounded-mac px-2 py-1.5 font-mono text-[12px] hover:bg-mac-control/50"
                    >
                      <span className="w-6 text-mac-label-tertiary">{i + 1}.</span>
                      <span className="text-mac-label">{formatCronDate(d, timezone)}</span>
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

      <footer className="flex shrink-0 items-center border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={error ? 'danger' : runs.length ? 'success' : 'neutral'}>
          {!error && parsed.ok
            ? `${parsed.hasSeconds ? '6-field' : '5-field'} · ${runs.length} upcoming`
            : error}
        </ToolStatus>
      </footer>
    </div>
  )
}
