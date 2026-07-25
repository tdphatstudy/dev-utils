/**
 * Standard cron (5-field) and optional seconds (6-field).
 * Fields: [sec] min hour day-of-month month day-of-week
 *
 * Day-of-month vs day-of-week: when both are restricted (not * / ?),
 * a time matches if EITHER field matches (classic cron OR semantics).
 */

export type CronFieldName =
  | 'second'
  | 'minute'
  | 'hour'
  | 'dayOfMonth'
  | 'month'
  | 'dayOfWeek'

export interface CronFieldInfo {
  name: CronFieldName
  raw: string
  values: number[]
  label: string
  description: string
}

export interface ParsedCron {
  ok: true
  expression: string
  hasSeconds: boolean
  fields: CronFieldInfo[]
  human: string
  summary: string[]
}

export type CronParseResult = ParsedCron | { ok: false; error: string }

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12
}

const DOW: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6
}

const RANGES: Record<CronFieldName, { min: number; max: number; unit: string }> = {
  second: { min: 0, max: 59, unit: 'second' },
  minute: { min: 0, max: 59, unit: 'minute' },
  hour: { min: 0, max: 23, unit: 'hour' },
  dayOfMonth: { min: 1, max: 31, unit: 'day' },
  month: { min: 1, max: 12, unit: 'month' },
  dayOfWeek: { min: 0, max: 6, unit: 'weekday' }
}

const FIELD_LABEL: Record<CronFieldName, string> = {
  second: 'Second',
  minute: 'Minute',
  hour: 'Hour',
  dayOfMonth: 'Day of month',
  month: 'Month',
  dayOfWeek: 'Day of week'
}

const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH_NAMES = [
  '',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]

export const CRON_PRESETS: { label: string; expr: string; hint: string }[] = [
  { label: 'Every minute', expr: '* * * * *', hint: 'Every minute' },
  { label: 'Every 5 minutes', expr: '*/5 * * * *', hint: 'At minute 0, 5, 10, …' },
  { label: 'Every 15 minutes', expr: '*/15 * * * *', hint: 'Quarter-hour' },
  { label: 'Hourly', expr: '0 * * * *', hint: 'At minute 0 of every hour' },
  { label: 'Daily midnight', expr: '0 0 * * *', hint: '00:00 every day' },
  { label: 'Daily 9 AM', expr: '0 9 * * *', hint: '09:00 every day' },
  { label: 'Weekdays 9 AM', expr: '0 9 * * 1-5', hint: 'Mon–Fri at 09:00' },
  { label: 'Weekends noon', expr: '0 12 * * 0,6', hint: 'Sat & Sun 12:00' },
  { label: 'Monthly 1st', expr: '0 0 1 * *', hint: 'First of month midnight' },
  { label: 'Yearly Jan 1', expr: '0 0 1 1 *', hint: 'New Year midnight' },
  { label: 'Every 30s (6-field)', expr: '*/30 * * * * *', hint: 'Seconds field enabled' },
  { label: 'Business hours', expr: '0 9-17 * * 1-5', hint: 'Hourly 9–17 Mon–Fri' }
]

function normalizeToken(token: string, field: CronFieldName): string {
  const t = token.trim().toLowerCase()
  if (field === 'month' && MONTHS[t] != null) return String(MONTHS[t])
  if (field === 'dayOfWeek' && DOW[t] != null) return String(DOW[t])
  // Sunday as 7 → 0
  if (field === 'dayOfWeek' && t === '7') return '0'
  return token.trim()
}

function parseNumber(token: string, field: CronFieldName, min: number, max: number): number {
  const n = Number(normalizeToken(token, field))
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${FIELD_LABEL[field]}: invalid value "${token}" (expected ${min}–${max})`)
  }
  // day-of-week 7 = Sunday
  if (field === 'dayOfWeek' && n === 7) return 0
  return n
}

function expandPart(part: string, field: CronFieldName): number[] {
  const { min, max } = RANGES[field]
  const raw = part.trim()
  if (!raw) throw new Error(`${FIELD_LABEL[field]}: empty segment`)

  // ?
  if (raw === '?') {
    if (field !== 'dayOfMonth' && field !== 'dayOfWeek') {
      throw new Error(`"?" is only valid for day-of-month or day-of-week`)
    }
    return range(min, max)
  }

  // *
  if (raw === '*') return range(min, max)

  // */step or base/step
  if (raw.includes('/')) {
    const [base, stepStr] = raw.split('/')
    if (stepStr == null || stepStr === '' || base === undefined) {
      throw new Error(`${FIELD_LABEL[field]}: invalid step "${raw}"`)
    }
    const step = Number(stepStr)
    if (!Number.isInteger(step) || step <= 0) {
      throw new Error(`${FIELD_LABEL[field]}: step must be a positive integer`)
    }
    let start = min
    let end = max
    if (base !== '*') {
      if (base.includes('-')) {
        const [a, b] = base.split('-')
        start = parseNumber(a!, field, min, max)
        end = parseNumber(b!, field, min, max)
      } else {
        start = parseNumber(base, field, min, max)
        end = max
      }
    }
    if (start > end) throw new Error(`${FIELD_LABEL[field]}: range start > end`)
    const out: number[] = []
    for (let i = start; i <= end; i += step) out.push(i)
    return out
  }

  // a-b
  if (raw.includes('-')) {
    const [a, b] = raw.split('-')
    const start = parseNumber(a!, field, min, max)
    const end = parseNumber(b!, field, min, max)
    if (start > end) throw new Error(`${FIELD_LABEL[field]}: range start > end`)
    return range(start, end)
  }

  return [parseNumber(raw, field, min, max)]
}

function expandField(raw: string, field: CronFieldName): number[] {
  const parts = raw.split(',')
  const set = new Set<number>()
  for (const p of parts) {
    for (const v of expandPart(p, field)) set.add(v)
  }
  return [...set].sort((a, b) => a - b)
}

function range(a: number, b: number): number[] {
  const out: number[] = []
  for (let i = a; i <= b; i++) out.push(i)
  return out
}

function describeField(field: CronFieldName, raw: string, values: number[]): string {
  const { min, max, unit } = RANGES[field]
  const r = raw.trim()
  if (r === '*' || r === '?') return `every ${unit}`
  if (r.startsWith('*/')) {
    const step = r.slice(2)
    return `every ${step} ${unit}${step === '1' ? '' : 's'}`
  }
  if (values.length === max - min + 1) return `every ${unit}`
  if (field === 'dayOfWeek') {
    if (values.length <= 7) return values.map((v) => DOW_NAMES[v] ?? v).join(', ')
  }
  if (field === 'month') {
    if (values.length <= 12) return values.map((v) => MONTH_NAMES[v] ?? v).join(', ')
  }
  if (values.length <= 12) return values.join(', ')
  if (values.length > 20) return `${values.length} values (${values[0]}…${values[values.length - 1]})`
  return values.join(', ')
}

function buildHuman(fields: CronFieldInfo[], hasSeconds: boolean): string {
  const get = (n: CronFieldName): CronFieldInfo => fields.find((f) => f.name === n)!
  const min = get('minute')
  const hour = get('hour')
  const dom = get('dayOfMonth')
  const mon = get('month')
  const dow = get('dayOfWeek')
  const sec = hasSeconds ? get('second') : null

  const parts: string[] = ['At']

  if (sec && sec.raw !== '0' && sec.raw !== '*') {
    parts.push(`second ${sec.description},`)
  }

  if (min.raw === '*' && hour.raw === '*') {
    parts.push('every minute')
  } else if (min.raw.startsWith('*/') && hour.raw === '*') {
    parts.push(min.description)
  } else if (min.raw !== '*' && hour.raw === '*') {
    parts.push(`minute ${min.description} of every hour`)
  } else if (min.raw === '0' && hour.raw !== '*') {
    parts.push(`${pad(hour.values[0] ?? 0)}:00`)
    if (hour.values.length > 1) parts.push(`(hours: ${hour.description})`)
  } else {
    parts.push(`minute ${min.description}`)
    parts.push(`hour ${hour.description}`)
  }

  const domAll = dom.raw === '*' || dom.raw === '?'
  const dowAll = dow.raw === '*' || dow.raw === '?'
  if (!domAll && !dowAll) {
    parts.push(`on day-of-month ${dom.description} or ${dow.description}`)
  } else if (!domAll) {
    parts.push(`on day ${dom.description}`)
  } else if (!dowAll) {
    parts.push(`on ${dow.description}`)
  } else {
    parts.push('every day')
  }

  if (mon.raw !== '*') {
    parts.push(`in ${mon.description}`)
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function parseCron(expression: string): CronParseResult {
  const expr = expression.trim().replace(/\s+/g, ' ')
  if (!expr) return { ok: false, error: 'Expression is empty' }

  const tokens = expr.split(' ')
  if (tokens.length !== 5 && tokens.length !== 6) {
    return {
      ok: false,
      error: `Expected 5 fields (min hour dom month dow) or 6 (sec min hour dom month dow), got ${tokens.length}`
    }
  }

  const hasSeconds = tokens.length === 6
  const names: CronFieldName[] = hasSeconds
    ? ['second', 'minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek']
    : ['minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek']

  try {
    const fields: CronFieldInfo[] = names.map((name, i) => {
      const raw = tokens[i]!
      const values = expandField(raw, name)
      if (!values.length) throw new Error(`${FIELD_LABEL[name]}: no values`)
      return {
        name,
        raw,
        values,
        label: FIELD_LABEL[name],
        description: describeField(name, raw, values)
      }
    })

    // Implicit seconds = 0 for 5-field
    if (!hasSeconds) {
      fields.unshift({
        name: 'second',
        raw: '0',
        values: [0],
        label: FIELD_LABEL.second,
        description: '0 (implicit for 5-field cron)'
      })
    }

    const human = buildHuman(fields, hasSeconds)
    const summary = fields.map((f) => `${f.label}: ${f.description}`)

    return {
      ok: true,
      expression: expr,
      hasSeconds,
      fields,
      human,
      summary
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid cron expression' }
  }
}

function fieldSet(parsed: ParsedCron, name: CronFieldName): Set<number> {
  return new Set(parsed.fields.find((f) => f.name === name)!.values)
}

function matchesDate(parsed: ParsedCron, d: Date): boolean {
  const sec = fieldSet(parsed, 'second')
  const min = fieldSet(parsed, 'minute')
  const hour = fieldSet(parsed, 'hour')
  const mon = fieldSet(parsed, 'month')
  const dom = fieldSet(parsed, 'dayOfMonth')
  const dow = fieldSet(parsed, 'dayOfWeek')

  if (!sec.has(d.getSeconds())) return false
  if (!min.has(d.getMinutes())) return false
  if (!hour.has(d.getHours())) return false
  if (!mon.has(d.getMonth() + 1)) return false

  const domRaw = parsed.fields.find((f) => f.name === 'dayOfMonth')!.raw
  const dowRaw = parsed.fields.find((f) => f.name === 'dayOfWeek')!.raw
  const domAll = domRaw === '*' || domRaw === '?'
  const dowAll = dowRaw === '*' || dowRaw === '?'
  const day = d.getDate()
  const weekday = d.getDay() // 0=Sun

  if (domAll && dowAll) return true
  if (!domAll && dowAll) return dom.has(day)
  if (domAll && !dowAll) return dow.has(weekday)
  // Both restricted → OR
  return dom.has(day) || dow.has(weekday)
}

/**
 * Next `count` fire times at or after `from` (if from lands exactly on a fire and inclusive).
 * Iterates second-by-second (or minute if only second=0).
 */
export function nextRuns(
  parsed: ParsedCron,
  from: Date = new Date(),
  count = 10,
  options?: { inclusive?: boolean; maxScanMs?: number }
): Date[] {
  const inclusive = options?.inclusive ?? false
  const maxScanMs = options?.maxScanMs ?? 1000 * 60 * 60 * 24 * 366 * 2 // 2 years
  const results: Date[] = []
  const start = new Date(from.getTime())
  // Align to second
  start.setMilliseconds(0)
  if (!inclusive) start.setSeconds(start.getSeconds() + 1)

  const onlyZeroSec =
    parsed.fields.find((f) => f.name === 'second')!.values.length === 1 &&
    parsed.fields.find((f) => f.name === 'second')!.values[0] === 0

  let cursor = start.getTime()
  const end = from.getTime() + maxScanMs
  let guard = 0
  const maxGuard = onlyZeroSec ? 60 * 24 * 370 * 2 : 60 * 60 * 24 * 370 * 2

  while (results.length < count && cursor <= end && guard < maxGuard) {
    guard++
    const d = new Date(cursor)
    if (matchesDate(parsed, d)) {
      results.push(new Date(d))
      // Jump forward at least 1 unit after match
      cursor += onlyZeroSec ? 60_000 : 1000
      continue
    }
    // Smart-ish skip: if second wrong and we have sparse seconds, jump
    if (onlyZeroSec && d.getSeconds() !== 0) {
      d.setSeconds(0, 0)
      d.setMinutes(d.getMinutes() + 1)
      cursor = d.getTime()
      continue
    }
    cursor += onlyZeroSec ? 60_000 : 1000
  }

  return results
}

export function formatCronDate(d: Date): string {
  const y = d.getFullYear()
  const mo = pad(d.getMonth() + 1)
  const day = pad(d.getDate())
  const h = pad(d.getHours())
  const mi = pad(d.getMinutes())
  const s = pad(d.getSeconds())
  const wd = DOW_NAMES[d.getDay()]
  return `${y}-${mo}-${day} ${h}:${mi}:${s} (${wd})`
}

export function cronToJson(parsed: ParsedCron, runs: Date[]): string {
  return JSON.stringify(
    {
      expression: parsed.expression,
      hasSeconds: parsed.hasSeconds,
      human: parsed.human,
      fields: parsed.fields.map((f) => ({
        name: f.name,
        raw: f.raw,
        values: f.values,
        description: f.description
      })),
      nextRuns: runs.map((d) => d.toISOString())
    },
    null,
    2
  )
}
