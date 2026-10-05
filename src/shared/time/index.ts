export type TimestampUnit = 'seconds' | 'milliseconds'
export type CalendarUnit = 'days' | 'weeks' | 'months' | 'years'
export type DurationUnit = 'milliseconds' | 'seconds' | 'minutes' | 'hours' | 'days'
export const DURATION_MS: Record<DurationUnit, number> = { milliseconds: 1, seconds: 1_000, minutes: 60_000, hours: 3_600_000, days: 86_400_000 }

interface CalendarDate { year: number; month: number; day: number }
const MIN_INSTANT = -62_135_596_800_000 // 0001-01-01T00:00:00.000Z
const MAX_INSTANT = 253_402_300_799_999 // 9999-12-31T23:59:59.999Z

function checkedInstant(value: number): number {
  if (!Number.isSafeInteger(value) || value < MIN_INSTANT || value > MAX_INSTANT) throw new Error('Date must be between years 0001 and 9999, with millisecond precision.')
  return value
}

function monthDays(year: number, month: number): number {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
}

function calendarDate(input: string): CalendarDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input)
  if (!match) throw new Error('Use a calendar date in YYYY-MM-DD format.')
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3])
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > monthDays(year, month)) throw new Error('Enter a real calendar date between years 0001 and 9999.')
  return { year, month, day }
}

function utcDate({ year, month, day }: CalendarDate): Date {
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCHours(0, 0, 0, 0)
  return date
}

export function parseTimestamp(input: string, unit: TimestampUnit): number {
  const value = input.trim()
  if (value.length > 32 || !/^[+-]?\d+(?:\.\d{1,3})?$/.test(value)) throw new Error('Enter a Unix number. Seconds accept up to 3 decimal places; milliseconds must be whole numbers.')
  if (unit !== 'seconds' && unit !== 'milliseconds') throw new Error('Choose Unix seconds or milliseconds.')
  if (unit === 'milliseconds' && value.includes('.')) throw new Error('Unix milliseconds must be a whole number.')
  // Parse the fraction as integer milliseconds to avoid binary decimal rounding.
  const negative = value.startsWith('-')
  const unsigned = value.replace(/^[+-]/, '')
  const [whole, fraction = ''] = unsigned.split('.')
  const millis = unit === 'seconds' ? Number(whole) * 1_000 + Number(fraction.padEnd(3, '0')) : Number(whole)
  return checkedInstant(negative ? -millis : millis)
}

/** Dates alone mean midnight UTC; date-times must carry an explicit offset. */
export function parseInstant(input: string): number {
  const value = input.trim()
  if (value.length > 40) throw new Error('Use an ISO date or date-time with Z / UTC offset.')
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return checkedInstant(utcDate(calendarDate(value)).getTime())
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value)
  if (!match) throw new Error('Use YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss with Z / UTC offset, for example 2026-10-05T09:30:00+07:00.')
  const date = utcDate(calendarDate(match[1]))
  const hours = Number(match[2]), minutes = Number(match[3]), seconds = Number(match[4] ?? 0)
  if (hours > 23 || minutes > 59 || seconds > 59) throw new Error('Time must use hours 00–23 and minutes/seconds 00–59. Leap seconds are unsupported.')
  const offsetHours = Number(match[8] ?? 0), offsetMinutes = Number(match[9] ?? 0)
  if (offsetHours > 23 || offsetMinutes > 59) throw new Error('UTC offset must use hours 00–23 and minutes 00–59.')
  date.setUTCHours(hours, minutes, seconds, Number((match[5] ?? '').padEnd(3, '0')))
  const offset = (offsetHours * 60 + offsetMinutes) * 60_000 * (match[7] === '-' ? -1 : 1)
  return checkedInstant(date.getTime() - offset)
}

export function unixSeconds(milliseconds: number): string {
  checkedInstant(milliseconds)
  const absolute = Math.abs(milliseconds)
  const fraction = String(absolute % 1_000).padStart(3, '0').replace(/0+$/, '')
  return `${milliseconds < 0 ? '-' : ''}${Math.floor(absolute / 1_000)}${fraction ? `.${fraction}` : ''}`
}

const formatters = new Map<string, Intl.DateTimeFormat>()
function zoneFormatter(timeZone: string): Intl.DateTimeFormat {
  if (!timeZone || timeZone.length > 100) throw new Error('Choose a valid IANA timezone, such as Asia/Ho_Chi_Minh.')
  const known = formatters.get(timeZone)
  if (known) return known
  let formatter: Intl.DateTimeFormat
  try {
    formatter = new Intl.DateTimeFormat('en-GB', { timeZone, calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', era: 'short' })
  } catch { throw new Error('Unknown timezone. Use an IANA name, such as UTC, Europe/London or Asia/Ho_Chi_Minh.') }
  if (formatters.size >= 16) formatters.delete(formatters.keys().next().value!)
  formatters.set(timeZone, formatter)
  return formatter
}

export interface ZonedInstant { text: string; offset: string; timezone: string; weekday: string }
export function formatZonedInstant(milliseconds: number, timeZone: string): ZonedInstant {
  checkedInstant(milliseconds)
  const formatter = zoneFormatter(timeZone)
  const fields = Object.fromEntries(formatter.formatToParts(new Date(milliseconds)).map((part) => [part.type, part.value]))
  const year = fields.era === 'BC' ? 1 - Number(fields.year) : Number(fields.year)
  const wall = utcDate({ year, month: Number(fields.month), day: Number(fields.day) })
  wall.setUTCHours(Number(fields.hour), Number(fields.minute), Number(fields.second))
  const offsetSeconds = Math.round((wall.getTime() - Math.floor(milliseconds / 1_000) * 1_000) / 1_000)
  const absolute = Math.abs(offsetSeconds)
  const pad = (n: number): string => String(n).padStart(2, '0')
  const offset = offsetSeconds === 0 ? 'Z' : `${offsetSeconds < 0 ? '-' : '+'}${pad(Math.floor(absolute / 3_600))}:${pad(Math.floor(absolute / 60) % 60)}${absolute % 60 ? `:${pad(absolute % 60)}` : ''}`
  const yearText = year >= 0 ? String(year).padStart(4, '0') : `-${String(Math.abs(year)).padStart(4, '0')}`
  return {
    text: `${yearText}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}:${fields.second}.${String(((milliseconds % 1_000) + 1_000) % 1_000).padStart(3, '0')}${offset}`,
    offset, timezone: formatter.resolvedOptions().timeZone,
    weekday: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][wall.getUTCDay()]
  }
}

export function addCalendarDate(input: string, amount: number, unit: CalendarUnit): string {
  const parsed = calendarDate(input)
  if (!Number.isSafeInteger(amount) || Math.abs(amount) > 3_650_000) throw new Error('Calendar amount must be a whole number between −3,650,000 and 3,650,000.')
  if (!['days', 'weeks', 'months', 'years'].includes(unit)) throw new Error('Choose days, weeks, months or years.')
  let date: Date
  if (unit === 'months' || unit === 'years') {
    const index = parsed.year * 12 + parsed.month - 1 + amount * (unit === 'years' ? 12 : 1)
    const year = Math.floor(index / 12), month = ((index % 12) + 12) % 12 + 1
    if (year < 1 || year > 9999) throw new Error('Result is outside years 0001–9999.')
    date = utcDate({ year, month, day: Math.min(parsed.day, monthDays(year, month)) })
  } else {
    date = utcDate(parsed)
    date.setUTCDate(date.getUTCDate() + amount * (unit === 'weeks' ? 7 : 1))
  }
  checkedInstant(date.getTime())
  return date.toISOString().slice(0, 10)
}

export function calendarDayDifference(start: string, end: string): number {
  return (utcDate(calendarDate(end)).getTime() - utcDate(calendarDate(start)).getTime()) / DURATION_MS.days
}

export function addDuration(milliseconds: number, amount: number, unit: DurationUnit): number {
  checkedInstant(milliseconds)
  if (!Object.prototype.hasOwnProperty.call(DURATION_MS, unit)) throw new Error('Choose a duration unit.')
  if (!Number.isFinite(amount)) throw new Error('Duration must be a finite number.')
  // Decimal arithmetic keeps values such as 0.29 hours exact, without rounding
  // sub-millisecond input or propagating binary floating-point multiplication.
  const parts = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/.exec(String(amount))!
  const fraction = parts[3] ?? ''
  const scale = fraction.length - Number(parts[4] ?? 0)
  const numerator = BigInt(parts[2] + fraction) * BigInt(DURATION_MS[unit]) * (parts[1] ? -1n : 1n) * (scale < 0 ? 10n ** BigInt(-scale) : 1n)
  const denominator = scale > 0 ? 10n ** BigInt(scale) : 1n
  if (numerator % denominator !== 0n) throw new Error('Duration must resolve to a whole number of milliseconds within the supported range.')
  const delta = Number(numerator / denominator)
  if (!Number.isSafeInteger(delta)) throw new Error('Duration is outside the supported range.')
  return checkedInstant(milliseconds + delta)
}

export function elapsedDifference(start: number, end: number): number {
  return checkedInstant(end) - checkedInstant(start)
}

export function describeDuration(milliseconds: number): string {
  if (!Number.isSafeInteger(milliseconds)) throw new Error('Duration must be a whole number of milliseconds.')
  let remaining = Math.abs(milliseconds)
  const parts: string[] = []
  for (const [label, size] of [['d', DURATION_MS.days], ['h', DURATION_MS.hours], ['m', DURATION_MS.minutes], ['s', DURATION_MS.seconds], ['ms', 1]] as const) {
    const value = Math.floor(remaining / size)
    remaining %= size
    if (value) parts.push(`${value}${label}`)
  }
  return `${milliseconds < 0 ? '−' : ''}${parts.join(' ') || '0ms'}`
}
