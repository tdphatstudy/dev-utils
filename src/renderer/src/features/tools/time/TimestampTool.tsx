import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useMemo, useState } from 'react'
import { formatZonedInstant, parseInstant, parseTimestamp, unixSeconds, type TimestampUnit } from '@shared/time'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'

type InputMode = 'timestamp' | 'date'
const TIMEZONES = ['UTC', 'Asia/Ho_Chi_Minh', 'Asia/Bangkok', 'Asia/Tokyo', 'Asia/Kolkata', 'Asia/Shanghai', 'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney']

export default function TimestampTool(): JSX.Element {
  useUiLocale()
  const [initial] = useState(() => Date.now())
  const [mode, setMode] = useState<InputMode>('timestamp')
  const [unit, setUnit] = useState<TimestampUnit>('seconds')
  const [timestamp, setTimestamp] = useState(() => unixSeconds(initial))
  const [date, setDate] = useState(() => new Date(initial).toISOString())
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
  const result = useMemo(() => {
    try {
      const milliseconds = mode === 'timestamp' ? parseTimestamp(timestamp, unit) : parseInstant(date)
      const zoned = formatZonedInstant(milliseconds, timezone)
      return { milliseconds, zoned, error: '' }
    } catch (error) { return { milliseconds: null, zoned: null, error: error instanceof Error ? error.message : 'Could not convert this time.' } }
  }, [mode, timestamp, unit, date, timezone])
  const now = (): void => {
    const value = Date.now()
    setTimestamp(unit === 'seconds' ? unixSeconds(value) : String(value))
    setDate(new Date(value).toISOString())
  }
  const changeUnit = (next: TimestampUnit): void => {
    try {
      const value = parseTimestamp(timestamp, unit)
      setTimestamp(next === 'seconds' ? unixSeconds(value) : String(value))
    } catch { /* Keep invalid input visible so the user can correct it. */ }
    setUnit(next)
  }
  const changeMode = (next: InputMode): void => {
    try {
      const value = mode === 'timestamp' ? parseTimestamp(timestamp, unit) : parseInstant(date)
      if (next === 'date') setDate(new Date(value).toISOString())
      else setTimestamp(unit === 'seconds' ? unixSeconds(value) : String(value))
    } catch { /* Retain both inputs when the current one needs correction. */ }
    setMode(next)
  }
  const rows = result.milliseconds !== null && result.zoned ? [
    ['Unix seconds', unixSeconds(result.milliseconds)],
    ['Unix milliseconds', String(result.milliseconds)],
    ['ISO 8601 · UTC', new Date(result.milliseconds).toISOString()],
    [`${result.zoned.timezone} · ${result.zoned.weekday}`, result.zoned.text],
    ['UTC offset at this instant', result.zoned.offset],
    ['UTC readable', new Date(result.milliseconds).toUTCString()]
  ] : []

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ToolToolbar><SegmentedControl label="Timestamp input type" value={mode} onChange={changeMode} options={[{ value: 'timestamp', label: 'Unix timestamp' }, { value: 'date', label: 'Date / ISO' }]} /><button type="button" className="mac-btn-secondary" onClick={now}>Now</button><span className="ml-auto text-[12px] text-mac-label-tertiary">Snapshot · refresh with Now</span></ToolToolbar>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto p-4">
        <div className="space-y-3 rounded-mac-lg border border-mac-separator bg-mac-surface p-4">
          {mode === 'timestamp' ? <>
            <label htmlFor="timestamp-input" className="block text-[12px] font-medium text-mac-label">Unix timestamp</label>
            <div className="flex flex-wrap gap-2"><input id="timestamp-input" className="mac-input min-w-[180px] flex-1 font-mono" inputMode="decimal" maxLength={32} spellCheck={false} value={timestamp} aria-invalid={!!result.error} onChange={(event) => setTimestamp(event.target.value)} /><select aria-label="Unix timestamp unit" className="mac-input !w-auto" value={unit} onChange={(event) => changeUnit(event.target.value as TimestampUnit)}><option value="seconds">Seconds</option><option value="milliseconds">Milliseconds</option></select></div>
            <p className="text-[12px] text-mac-label-secondary">Units are explicit. Seconds allow 3 decimal places; milliseconds are whole numbers. Negative values are before 1970.</p>
          </> : <>
            <label htmlFor="timestamp-date" className="block text-[12px] font-medium text-mac-label">ISO date or date-time</label>
            <input id="timestamp-date" className="mac-input font-mono" maxLength={40} spellCheck={false} value={date} aria-invalid={!!result.error} onChange={(event) => setDate(event.target.value)} />
            <p className="text-[12px] text-mac-label-secondary">Date-times require Z or an explicit offset, such as 2026-10-05T09:30:00+07:00. A date alone means midnight UTC.</p>
          </>}
          <div className="flex flex-wrap items-center gap-2"><label htmlFor="timestamp-zone" className="text-[12px] text-mac-label-secondary">Display timezone</label><input id="timestamp-zone" list="timestamp-zones" className="mac-input min-w-[180px] flex-1 font-mono text-[12px]" maxLength={100} value={timezone} onChange={(event) => setTimezone(event.target.value)} /><datalist id="timestamp-zones">{TIMEZONES.map((zone) => <option key={zone} value={zone} />)}</datalist><button type="button" className="mac-btn-secondary" onClick={() => setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')}>Local</button><button type="button" className="mac-btn-secondary" onClick={() => setTimezone('UTC')}>UTC</button></div>
        </div>
        {result.error && <p role="alert" className="text-[13px] text-mac-danger">{result.error}</p>}
        <dl className="space-y-2">{rows.map(([label, value]) => <div key={label} className="flex flex-wrap items-center gap-3 rounded-mac-lg border border-mac-separator bg-mac-surface px-4 py-3"><div className="min-w-0 flex-1"><dt className="mb-1 text-[11px] font-semibold text-mac-label-secondary">{label}</dt><dd className="select-text break-all font-mono text-[13px] text-mac-label">{value}</dd></div><CopyButton text={value} label={uiText('Copy')} /></div>)}</dl>
        <p className="text-[12px] leading-relaxed text-mac-label-tertiary">The chosen timezone changes the display of the same instant. DST and historical offsets follow this app’s timezone database. Offset-less local date-times are rejected to avoid ambiguous clock changes.</p>
      </div>
      <footer className="border-t border-mac-separator px-4 py-2"><ToolStatus tone={result.error ? 'danger' : 'success'}>{result.error || 'Same instant · seconds, milliseconds and timezone formats'}</ToolStatus></footer>
    </div>
  )
}
