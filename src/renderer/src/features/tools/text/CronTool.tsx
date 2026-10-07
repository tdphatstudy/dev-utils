import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useId, useMemo, useState } from 'react'
import { ChevronDown, Undo2 } from 'lucide-react'
import { CRON_PRESETS, cronToJson, formatCronDate, nextRuns, parseCron } from '@shared/cron'
import { parseCronStart } from '@shared/cron/start-time'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { SplitPane } from '@renderer/components/ui/SplitPane'
import { TextInputActions } from '@renderer/components/ui/TextInputActions'
import { ToolOptions, ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import { useToolDraft } from '@renderer/hooks/useToolDraft'
import { SaveToBoxButton } from '@renderer/features/secret-box/SaveToBoxButton'
import { cn } from '@renderer/lib/utils'

export default function CronTool(): JSX.Element {
  useUiLocale()
  const [expr, setExpr] = useState('*/5 9-17 * * 1-5')
  const [countInput, setCountInput] = useState('10')
  const [timezone, setTimezone] = useState<'local' | 'UTC'>('local')
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 19) + 'Z')
  const [activePane, setActivePane] = useState<0 | 1>(0)
  const [undo, setUndo] = useState<string | null>(null)
  const id = useId()
  const expressionId = `${id}-expression`
  const expressionHintId = `${id}-expression-hint`
  const expressionErrorId = `${id}-expression-error`
  const startId = `${id}-start`
  const startHintId = `${id}-start-hint`
  const startErrorId = `${id}-start-error`
  const countId = `${id}-count`
  const countErrorId = `${id}-count-error`
  const zoneId = `${id}-zone`

  useToolDraft('text.cron', expr, setExpr, { label: 'Cron', historyOnUnmount: true })
  useToolDraft('text.cron.timezone', timezone, (value) => { if (value === 'local' || value === 'UTC') setTimezone(value) })
  useToolDraft('text.cron.from', from, setFrom)
  useToolDraft('text.cron.count', countInput, setCountInput)

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const zoneLabel = timezone === 'UTC' ? 'UTC' : tz
  const start = useMemo(() => parseCronStart(from), [from])
  const fromDate = start.ok ? start.date : null
  const count = Number(countInput)
  const countValid = countInput.trim() !== '' && Number.isInteger(count) && count >= 1 && count <= 50
  const parsed = useMemo(() => parseCron(expr), [expr])
  const runs = useMemo(() => {
    if (!parsed.ok || !fromDate || !countValid) return []
    return nextRuns(parsed, fromDate, count, { timezone })
  }, [parsed, count, fromDate, countValid, timezone])
  const jsonOut = useMemo(() => {
    if (!parsed.ok || !fromDate || !countValid) return ''
    return JSON.stringify({
      ...JSON.parse(cronToJson(parsed, runs)),
      timezone: zoneLabel,
      from: fromDate.toISOString(),
      searchHorizonYears: 8
    }, null, 2)
  }, [parsed, runs, fromDate, countValid, zoneLabel])
  const expressionError = !parsed.ok ? `${parsed.error}${parsed.column ? ` · column ${parsed.column}` : ''}` : null
  const countError = !countValid ? 'Enter a whole number from 1 to 50.' : null
  const error = expressionError ?? (!start.ok ? start.error : countError)
  const errorField = !parsed.ok ? expressionId : !start.ok ? startId : countId
  const focusError = (): void => {
    setActivePane(0)
    requestAnimationFrame(() => document.getElementById(errorField)?.focus())
  }
  const applyPreset = (expression: string): void => {
    if (expression === expr) return
    setUndo(expr)
    setExpr(expression)
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto" data-cron-workspace>
      <div className="flex min-h-[240px] flex-1 flex-col">
        <SplitPane labels={['Schedule', 'Upcoming runs']} activePane={activePane} onPaneChange={setActivePane}>
          <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-mac-lg border border-mac-separator bg-mac-surface" aria-label="Cron schedule settings">
            <ToolToolbar label="Cron expression actions" className="max-h-[40%] overflow-y-auto !px-3 !py-2">
              <CopyButton text={parsed.ok ? parsed.expression : ''} label="Copy expression" />
              {undo !== null && <button type="button" className="mac-btn-secondary" onClick={() => { setExpr(undo); setUndo(null) }} title="Restore the expression before choosing a preset"><Undo2 className="h-3.5 w-3.5" aria-hidden />Undo preset</button>}
              <span className="text-[12px] text-mac-label-secondary">{parsed.ok ? `${parsed.hasSeconds ? '6 fields · seconds enabled' : '5 fields · minute precision'}` : '5 or 6 fields'}</span>
            </ToolToolbar>
            <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3" tabIndex={0} aria-label="Schedule settings">
              <div className="space-y-2">
                <label htmlFor={expressionId} className="block text-[13px] font-semibold text-mac-label">Expression</label>
                <input
                  id={expressionId}
                  aria-invalid={!parsed.ok}
                  aria-describedby={`${expressionHintId}${expressionError ? ` ${expressionErrorId}` : ''}`}
                  className="mac-input font-mono text-[16px]"
                  value={expr}
                  maxLength={4096}
                  onChange={(event) => { setUndo(null); setExpr(event.target.value) }}
                  spellCheck={false}
                  placeholder="* * * * *"
                />
                <p id={expressionHintId} className="text-[12px] leading-relaxed text-mac-label-secondary">
                  {expr.trim().split(/\s+/).length === 6 ? 'second · minute · hour · day of month · month · day of week' : 'minute · hour · day of month · month · day of week'}
                </p>
                {expressionError && <p id={expressionErrorId} role="alert" className="text-[13px] leading-relaxed text-mac-danger">{expressionError}</p>}
              </div>

              <fieldset className="space-y-3 border-t border-mac-separator pt-3">
                <legend className="px-1 text-[13px] font-semibold text-mac-label">Preview settings</legend>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <label htmlFor={zoneId} className="block text-[13px] text-mac-label-secondary">Schedule timezone</label>
                    <select id={zoneId} className="mac-input" value={timezone} onChange={(event) => setTimezone(event.target.value as 'local' | 'UTC')}>
                      <option value="local">Local ({tz})</option>
                      <option value="UTC">UTC</option>
                    </select>
                  </div>
                  <div className="w-24 shrink-0 space-y-1.5">
                    <label htmlFor={countId} className="block text-[13px] text-mac-label-secondary">Run count</label>
                    <input id={countId} type="number" min={1} max={50} step={1} aria-invalid={!countValid} aria-describedby={countError ? countErrorId : undefined} className="mac-input font-mono" value={countInput} onChange={(event) => setCountInput(event.target.value)} />
                  </div>
                  {countError && <p id={countErrorId} role="alert" className="w-full text-[13px] text-mac-danger">{countError}</p>}
                </div>
                <div className="space-y-1.5">
                  <label htmlFor={startId} className="block text-[13px] text-mac-label-secondary">Preview after · ISO date and time</label>
                  <div className="flex min-w-0 gap-2">
                    <input id={startId} aria-invalid={!start.ok} aria-describedby={`${startHintId}${!start.ok ? ` ${startErrorId}` : ''}`} className="mac-input min-w-0 flex-1 font-mono text-[13px]" value={from} maxLength={128} onChange={(event) => setFrom(event.target.value)} spellCheck={false} />
                    <button type="button" className="mac-btn-secondary shrink-0" onClick={() => setFrom(new Date().toISOString().slice(0, 19) + 'Z')} title="Set the preview start to the current instant">Now</button>
                  </div>
                  <p id={startHintId} className="text-[12px] leading-relaxed text-mac-label-secondary">Use Z or a UTC offset, e.g. 2026-10-05T09:00:00+07:00. Only runs strictly after this instant are shown. Changing the schedule timezone keeps this instant.</p>
                  {!start.ok && <p id={startErrorId} role="alert" className="text-[13px] leading-relaxed text-mac-danger">{start.error}</p>}
                </div>
              </fieldset>

              <details className="group border-t border-mac-separator pt-2">
                <summary className="mac-btn-ghost cursor-pointer list-none [&::-webkit-details-marker]:hidden">Preset schedules<ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden /></summary>
                <p className="mb-2 mt-1 text-[12px] leading-relaxed text-mac-label-secondary">Choose a starting point. It replaces the expression; Undo preset restores your previous text.</p>
                <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))' }}>
                  {CRON_PRESETS.map((preset) => (
                    <button key={preset.expr + preset.label} type="button" onClick={() => applyPreset(preset.expr)} aria-pressed={expr === preset.expr} className={cn('min-w-0 rounded-mac border border-mac-separator px-3 py-2 text-left transition-colors hover:bg-mac-control/60', expr === preset.expr && 'border-mac-accent/40 bg-mac-accent-soft')}>
                      <span className="block text-[13px] font-medium text-mac-label">{preset.label}</span>
                      <code className="mt-1 block break-words text-[12px] text-mac-accent">{preset.expr}</code>
                      <span className="mt-1 block text-[12px] leading-relaxed text-mac-label-secondary">{preset.hint}</span>
                    </button>
                  ))}
                </div>
              </details>

              <details className="group border-t border-mac-separator pt-2">
                <summary className="mac-btn-ghost cursor-pointer list-none [&::-webkit-details-marker]:hidden">Syntax and compatibility<ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden /></summary>
                <div className="space-y-2 py-2 text-[13px] leading-relaxed text-mac-label-secondary">
                  <p><code className="font-mono text-mac-label">*</code> any value · <code className="font-mono text-mac-label">*/n</code> step · <code className="font-mono text-mac-label">a-b</code> range · <code className="font-mono text-mac-label">a,b</code> list. Steps repeat within each field, rather than measuring elapsed time.</p>
                  <p>Months: JAN–DEC. Weekdays: SUN–SAT (0 or 7 = Sunday). In this preview, ? on either day field means *.</p>
                  <p>When neither day field begins with * or ?, a date matches either day rule. Otherwise both day rules must match.</p>
                  <p>This tool previews a 5-field schedule or an optional leading seconds field. It does not support Quartz L/W/#, a year field, commands or @macros, and does not create a scheduled job.</p>
                  <p>Local previews skip missing DST times and include both repeated times. The UTC timestamps distinguish repeated local times. Confirm the syntax and DST policy of your actual scheduler.</p>
                </div>
              </details>
            </div>
          </section>

          <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-mac-lg border border-mac-separator bg-mac-surface" aria-label="Cron upcoming runs">
            <ToolToolbar label="Cron preview export" className="max-h-[40%] overflow-y-auto !px-3 !py-2">
              <CopyButton text={jsonOut} label="Copy JSON" />
              <ToolOptions label={uiText('Export')}>
                <TextInputActions value={expr} onChange={setExpr} output={jsonOut} fileName="cron-preview.json" accept=".json,application/json" actions={['download']} />
                <SaveToBoxButton type="json" content={jsonOut} defaultName="cron-preview.json" disabled={!jsonOut} />
              </ToolOptions>
            </ToolToolbar>
            <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3" tabIndex={0} aria-label="Upcoming run preview">
              {error ? (
                <div className="space-y-3 rounded-mac border border-mac-danger/30 bg-mac-danger/10 p-3">
                  <h2 className="text-[14px] font-semibold text-mac-label">Preview unavailable</h2>
                  <p className="text-[13px] leading-relaxed text-mac-danger">{error}</p>
                  <button type="button" className="mac-btn-secondary" onClick={focusError}>Fix {expressionError ? 'expression' : !start.ok ? 'start time' : 'run count'}</button>
                </div>
              ) : parsed.ok && (
                <>
                  <div className="space-y-2 border-b border-mac-separator pb-3">
                    <h2 className="text-[14px] font-semibold text-mac-label">{runs.length ? `Next ${runs.length} runs` : 'No upcoming runs'} · {zoneLabel}</h2>
                    <code className="block break-words font-mono text-[13px] text-mac-accent">{parsed.expression}</code>
                    <p className="text-[13px] leading-relaxed text-mac-label">{parsed.human}</p>
                    <p className="text-[12px] leading-relaxed text-mac-label-secondary">After <time dateTime={fromDate?.toISOString()} className="font-mono [overflow-wrap:anywhere]">{fromDate?.toISOString()}</time></p>
                  </div>
                  {runs.length === 0 ? (
                    <p className="text-[13px] leading-relaxed text-mac-warning">No matching dates were found within 8 years of the start. The expression is valid, but its day and month combination may be impossible. Check the day fields or try another preset.</p>
                  ) : (
                    <ol data-cron-runs className="space-y-2" aria-label="Upcoming run times">
                      {runs.map((date, index) => (
                        <li key={date.toISOString()} className="flex items-start gap-2 rounded-mac border border-mac-separator px-3 py-2">
                          <span className="w-6 shrink-0 text-[12px] leading-relaxed text-mac-label-secondary">{index + 1}.</span>
                          <div className="min-w-0 space-y-1">
                            <time dateTime={date.toISOString()} className="block font-mono text-[13px] leading-relaxed text-mac-label [overflow-wrap:anywhere]">{formatCronDate(date, timezone)}</time>
                            {timezone !== 'UTC' && <span className="block font-mono text-[12px] leading-relaxed text-mac-label-secondary [overflow-wrap:anywhere]">{date.toISOString()} · UTC</span>}
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                  <details className="group border-t border-mac-separator pt-2">
                    <summary className="mac-btn-ghost cursor-pointer list-none [&::-webkit-details-marker]:hidden">Field breakdown<ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden /></summary>
                    <dl className="mt-2 space-y-2">
                      {parsed.fields.map((field) => (
                        <div key={field.name} className="min-w-0 rounded-mac border border-mac-separator px-3 py-2">
                          <dt className="text-[13px] font-medium text-mac-label">{field.label}</dt>
                          <dd className="mt-1 space-y-1 text-[13px] leading-relaxed"><code className="block font-mono text-mac-accent [overflow-wrap:anywhere]">{field.raw}</code><span className="block text-mac-label-secondary [overflow-wrap:anywhere]">{field.description}</span></dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                </>
              )}
            </div>
          </section>
        </SplitPane>
      </div>
      <footer className="flex shrink-0 items-center border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={error ? 'danger' : runs.length ? 'success' : 'warning'}>
          {error ? `Fix ${expressionError ? 'the expression' : !start.ok ? 'the start time' : 'the run count'} to preview` : `${parsed.ok && parsed.hasSeconds ? '6-field' : '5-field'} · ${runs.length} upcoming · ${zoneLabel} · preview only`}
        </ToolStatus>
      </footer>
    </div>
  )
}