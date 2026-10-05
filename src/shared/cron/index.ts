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

export type CronParseResult = ParsedCron | { ok: false; error: string; field?: CronFieldName; column?: number }

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
  dayOfWeek: { min: 0, max: 7, unit: 'weekday' }
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
  if (field === 'month' && Object.hasOwn(MONTHS, t)) return String(MONTHS[t])
  if (field === 'dayOfWeek' && Object.hasOwn(DOW, t)) return String(DOW[t])
  return token.trim()
}

function parseNumber(token: string, field: CronFieldName, min: number, max: number): number {
  const normalized = normalizeToken(token, field)
  const n = /^\d+$/.test(normalized) ? Number(normalized) : NaN
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${FIELD_LABEL[field]}: invalid value "${token}" (expected ${min}–${max})`)
  }
  // day-of-week 7 = Sunday
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
    if (raw.split('/').length !== 2) throw new Error(`${FIELD_LABEL[field]}: expected one step separator`)
    const [base, stepStr] = raw.split('/')
    if (stepStr == null || stepStr === '' || base === undefined) {
      throw new Error(`${FIELD_LABEL[field]}: invalid step "${raw}"`)
    }
    const step = /^\d+$/.test(stepStr) ? Number(stepStr) : NaN
    if (!Number.isInteger(step) || step <= 0) {
      throw new Error(`${FIELD_LABEL[field]}: step must be a positive integer`)
    }
    let start = min
    let end = max
    if (base !== '*') {
      if (base.includes('-')) {
        if (base.split('-').length !== 2) throw new Error(`${FIELD_LABEL[field]}: invalid range`)
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
    if (raw.split('-').length !== 2) throw new Error(`${FIELD_LABEL[field]}: invalid range`)
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
    for (const v of expandPart(p, field)) set.add(field === 'dayOfWeek' && v === 7 ? 0 : v)
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

  if (sec) {
    parts.push(`seconds ${sec.values.join(', ')},`)
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

  const domWildcard = /^[*?]/.test(dom.raw), dowWildcard = /^[*?]/.test(dow.raw)
  const domAll = dom.raw === '*' || dom.raw === '?'
  const dowAll = dow.raw === '*' || dow.raw === '?'
  if (!domAll && !dowAll && (domWildcard || dowWildcard)) {
    parts.push(`on day-of-month ${dom.description} and ${dow.description}`)
  } else if (!domAll && !dowAll) {
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
  if (expression.length > 4096) return { ok: false, error: 'Expression exceeds 4096 characters.' }
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

  let currentField: CronFieldName | undefined
  let currentColumn: number | undefined
  try {
    const fields: CronFieldInfo[] = names.map((name, i) => {
      currentField = name
      currentColumn = [...expression.matchAll(/\S+/g)][i]!.index + 1
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
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid cron expression', field: currentField, column: currentColumn }
  }
}

function fieldSet(parsed: ParsedCron, name: CronFieldName): Set<number> {
  return new Set(parsed.fields.find((f) => f.name === name)!.values)
}

/**
 * Next `count` fire times at or after `from` (if from lands exactly on a fire and inclusive).
 * Skip nonmatching calendar days, walk eligible minutes and enumerate seconds.
 */
export function nextRuns(
  parsed: ParsedCron,
  from: Date = new Date(),
  count = 10,
  options?: { inclusive?: boolean; maxScanMs?: number; timezone?: 'local' | 'UTC' }
): Date[] {
  const inclusive = options?.inclusive ?? false
  const maxScanMs = options?.maxScanMs ?? 1000 * 60 * 60 * 24 * 366 * 8
  if (!Number.isFinite(from.getTime()) || !Number.isInteger(count) || count < 1 || count > 50 || !Number.isFinite(maxScanMs) || maxScanMs < 0) return []
  const utc = options?.timezone === 'UTC'
  const results: Date[] = []
  const seconds = parsed.fields.find((field) => field.name === 'second')!.values
  const minutes = fieldSet(parsed, 'minute'), hours = fieldSet(parsed, 'hour'), months = fieldSet(parsed, 'month')
  const dom = fieldSet(parsed, 'dayOfMonth'), dow = fieldSet(parsed, 'dayOfWeek')
  const domAll = /^[*?]/.test(parsed.fields.find((field) => field.name === 'dayOfMonth')!.raw)
  const dowAll = /^[*?]/.test(parsed.fields.find((field) => field.name === 'dayOfWeek')!.raw)
  let cursor = Math.floor(from.getTime() / 60000) * 60000
  const end = Math.min(from.getTime() + maxScanMs, from.getTime() + 1000 * 60 * 60 * 24 * 366 * 8, 8.64e15)
  while (results.length < count && cursor <= end) {
    const d = new Date(cursor)
    const month = utc ? d.getUTCMonth() + 1 : d.getMonth() + 1
    const day = utc ? d.getUTCDate() : d.getDate(), weekday = utc ? d.getUTCDay() : d.getDay()
    const dayMatches = domAll || dowAll ? dom.has(day) && dow.has(weekday) : dom.has(day) || dow.has(weekday)
    if (!months.has(month) || !dayMatches) {
      if (utc) d.setUTCHours(24, 0, 0, 0)
      else d.setHours(24, 0, 0, 0)
      cursor = d.getTime()
      continue
    }
    if (hours.has(utc ? d.getUTCHours() : d.getHours()) && minutes.has(utc ? d.getUTCMinutes() : d.getMinutes())) {
      for (const second of seconds) {
        const candidate = cursor + second * 1000
        if ((inclusive ? candidate >= from.getTime() : candidate > from.getTime()) && candidate <= end) results.push(new Date(candidate))
        if (results.length === count) break
      }
    }
    // Walk actual elapsed minutes so repeated DST hours are preserved.
    cursor += 60000
  }

  return results
}

export function formatCronDate(d: Date, timezone: 'local' | 'UTC' = 'local'): string {
  if (timezone === 'UTC') return `${d.toISOString().slice(0, 19).replace('T', ' ')} (UTC)`
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
