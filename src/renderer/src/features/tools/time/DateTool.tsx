import { messageKey } from '@shared/i18n/message-key'
import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useMemo, useState } from 'react'
import { addCalendarDate, addDuration, calendarDayDifference, describeDuration, DURATION_MS, elapsedDifference, parseInstant, unixSeconds, type CalendarUnit, type DurationUnit } from '@shared/time'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { ToolToolbar } from '@renderer/components/ui/ToolToolbar'

type Mode = 'calendar' | 'elapsed'
type Result<T> = { value: T; error: null } | { value: null; error: string }
function attempt<T>(run: () => T): Result<T> {
  try { return { value: run(), error: null } } catch (error) { return { value: null, error: error instanceof Error ? error.message : 'Check the input.' } }
}
function numberInput(value: string): number {
  if (value.length > 32 || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) throw new Error('Enter a valid amount.')
  return Number(value)
}

export default function DateTool(): JSX.Element {
  useUiLocale()
  const [initial] = useState(() => Date.now())
  const [mode, setMode] = useState<Mode>('calendar')
  const [baseDate, setBaseDate] = useState(() => new Date(initial).toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState(() => new Date(initial + DURATION_MS.days * 7).toISOString().slice(0, 10))
  const [calendarAmount, setCalendarAmount] = useState('1')
  const [calendarUnit, setCalendarUnit] = useState<CalendarUnit>('months')
  const [baseInstant, setBaseInstant] = useState(() => new Date(initial).toISOString())
  const [endInstant, setEndInstant] = useState(() => new Date(initial + DURATION_MS.hours).toISOString())
  const [durationAmount, setDurationAmount] = useState('1')
  const [durationUnit, setDurationUnit] = useState<DurationUnit>('hours')
  const calendar = useMemo(() => attempt(() => addCalendarDate(baseDate, numberInput(calendarAmount), calendarUnit)), [baseDate, calendarAmount, calendarUnit])
  const days = useMemo(() => attempt(() => calendarDayDifference(baseDate, endDate)), [baseDate, endDate])
  const duration = useMemo(() => attempt(() => addDuration(parseInstant(baseInstant), numberInput(durationAmount), durationUnit)), [baseInstant, durationAmount, durationUnit])
  const elapsed = useMemo(() => attempt(() => elapsedDifference(parseInstant(baseInstant), parseInstant(endInstant))), [baseInstant, endInstant])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ToolToolbar><SegmentedControl label={uiText('Date calculation mode')} value={mode} onChange={setMode} options={[{ value: 'calendar', label: messageKey('Calendar dates') }, { value: 'elapsed', label: messageKey('Elapsed time') }]} /></ToolToolbar>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <p className="mb-4 text-[13px] leading-relaxed text-mac-label-secondary">{mode === 'calendar' ? uiText('Add calendar days, weeks, months or years, or count days between two dates. Dates have no timezone.') : uiText('Calculate exact durations between instants with explicit UTC offsets. An elapsed day is always 24 hours.')}</p>
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {mode === 'calendar' ? <>
            <section className="space-y-4 rounded-mac-lg border border-mac-separator bg-mac-surface p-4" aria-labelledby="calendar-add-title">
              <h3 id="calendar-add-title" className="text-[14px] font-semibold text-mac-label">{uiText('Add or subtract a calendar amount')}</h3>
              <label htmlFor="calendar-base" className="grid gap-1.5 text-[12px] text-mac-label-secondary">{uiText('Start date')}<input id="calendar-base" type="date" min="0001-01-01" max="9999-12-31" className="mac-input font-mono" value={baseDate} onChange={(event) => setBaseDate(event.target.value)} /></label>
              <div className="flex flex-wrap gap-2"><label htmlFor="calendar-amount" className="grid min-w-[100px] flex-1 gap-1.5 text-[12px] text-mac-label-secondary">{uiText('Amount')}<input id="calendar-amount" type="number" step={1} className="mac-input font-mono" value={calendarAmount} onChange={(event) => setCalendarAmount(event.target.value)} /></label><label htmlFor="calendar-unit" className="grid gap-1.5 text-[12px] text-mac-label-secondary">{uiText('Unit')}<select id="calendar-unit" aria-label={uiText('Calendar unit')} className="mac-input" value={calendarUnit} onChange={(event) => setCalendarUnit(event.target.value as CalendarUnit)}>{(['days', 'weeks', 'months', 'years'] as const).map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></label></div>
              <p className="text-[12px] text-mac-label-tertiary">{uiText('Use a negative amount to subtract. Month/year additions clamp to the last valid day: Jan 31 + 1 month → Feb 28 or 29.')}</p>
              <Output result={calendar} />
            </section>
            <section className="space-y-4 rounded-mac-lg border border-mac-separator bg-mac-surface p-4" aria-labelledby="calendar-diff-title">
              <h3 id="calendar-diff-title" className="text-[14px] font-semibold text-mac-label">{uiText('Days between dates')}</h3>
              <p className="text-[12px] text-mac-label-secondary">{uiText('From')} {baseDate || uiText('the start date on the left')}</p>
              <label htmlFor="calendar-end" className="grid gap-1.5 text-[12px] text-mac-label-secondary">{uiText('End date')}<input id="calendar-end" type="date" min="0001-01-01" max="9999-12-31" className="mac-input font-mono" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
              <Output result={days.error ? { value: null, error: days.error } : { value: `${days.value} calendar days`, error: null }} />
              <p className="text-[12px] text-mac-label-tertiary">{uiText('End minus start; the end date is excluded. Same date = 0 days. A negative result means the end is earlier. Weekends and holidays are included.')}</p>
            </section>
          </> : <>
            <section className="space-y-4 rounded-mac-lg border border-mac-separator bg-mac-surface p-4" aria-labelledby="elapsed-add-title">
              <h3 id="elapsed-add-title" className="text-[14px] font-semibold text-mac-label">{uiText('Add or subtract a duration')}</h3>
              <label htmlFor="elapsed-base" className="grid gap-1.5 text-[12px] text-mac-label-secondary">{uiText('Start instant · ISO with Z / offset')}<input id="elapsed-base" className="mac-input font-mono text-[12px]" maxLength={40} spellCheck={false} value={baseInstant} onChange={(event) => setBaseInstant(event.target.value)} /></label>
              <div className="flex flex-wrap gap-2"><label htmlFor="elapsed-amount" className="grid min-w-[100px] flex-1 gap-1.5 text-[12px] text-mac-label-secondary">{uiText('Amount')}<input id="elapsed-amount" type="number" step="any" className="mac-input font-mono" value={durationAmount} onChange={(event) => setDurationAmount(event.target.value)} /></label><label htmlFor="elapsed-unit" className="grid gap-1.5 text-[12px] text-mac-label-secondary">{uiText('Unit')}<select id="elapsed-unit" aria-label={uiText('Duration unit')} className="mac-input" value={durationUnit} onChange={(event) => setDurationUnit(event.target.value as DurationUnit)}>{(Object.keys(DURATION_MS) as DurationUnit[]).map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></label></div>
              <Output result={duration.error || duration.value === null ? { value: null, error: duration.error ?? 'Check the duration.' } : { value: new Date(duration.value).toISOString(), error: null }} />
              {duration.value !== null && <div className="flex flex-wrap items-center gap-2 text-[12px] text-mac-label-secondary"><span>{uiText('Unix seconds:')} <code className="select-text font-mono">{unixSeconds(duration.value)}</code></span><CopyButton text={unixSeconds(duration.value)} label={uiText('Copy Unix')} /></div>}
              <p className="text-[12px] text-mac-label-tertiary">{uiText('Output is UTC. Fractions are accepted when they resolve to whole milliseconds. Around DST, +24 hours may land at a different local clock time.')}</p>
            </section>
            <section className="space-y-4 rounded-mac-lg border border-mac-separator bg-mac-surface p-4" aria-labelledby="elapsed-diff-title">
              <h3 id="elapsed-diff-title" className="text-[14px] font-semibold text-mac-label">{uiText('Elapsed time between instants')}</h3>
              <p className="break-all text-[12px] text-mac-label-secondary">{uiText('From')} <code className="font-mono">{baseInstant || 'the start instant on the left'}</code></p>
              <label htmlFor="elapsed-end" className="grid gap-1.5 text-[12px] text-mac-label-secondary">{uiText('End instant · ISO with Z / offset')}<input id="elapsed-end" className="mac-input font-mono text-[12px]" maxLength={40} spellCheck={false} value={endInstant} onChange={(event) => setEndInstant(event.target.value)} /></label>
              <Output result={elapsed.error || elapsed.value === null ? { value: null, error: elapsed.error ?? 'Check both instants.' } : { value: describeDuration(elapsed.value), error: null }} />
              {elapsed.value !== null && <dl className="space-y-1.5 text-[12px]">{(['milliseconds', 'seconds', 'minutes', 'hours', 'days'] as const).map((unit) => <div key={unit} className="flex flex-wrap justify-between gap-2"><dt className="text-mac-label-secondary">{unit}</dt><dd className="select-text break-all font-mono text-mac-label">{String(elapsed.value! / DURATION_MS[unit])}</dd></div>)}</dl>}
              <p className="text-[12px] text-mac-label-tertiary">{uiText('End minus start. Offsets are applied before calculating. Midnight to midnight across a DST transition may be 23 or 25 elapsed hours.')}</p>
            </section>
          </>}
        </div>
      </div>
    </div>
  )
}

function Output({ result }: { result: Result<string> }): JSX.Element {
  useUiLocale()
  return result.error !== null ? <p role="alert" className="text-[13px] text-mac-danger">{result.error}</p> : <div className="flex flex-wrap items-center gap-3 rounded-mac bg-mac-control/50 p-3"><output className="min-w-0 flex-1 select-text break-all font-mono text-[14px] text-mac-accent">{result.value}</output><CopyButton text={result.value} /></div>
}
