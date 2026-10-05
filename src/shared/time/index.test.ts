import { describe, expect, it } from 'vitest'
import { addCalendarDate, addDuration, calendarDayDifference, describeDuration, elapsedDifference, formatZonedInstant, parseInstant, parseTimestamp, unixSeconds } from './index'

describe('explicit Unix and ISO conversion', () => {
  it('round-trips decimal seconds, negative epochs and early Gregorian years exactly', () => {
    for (const value of ['0', '-0.001', '0.001', '-1.999', '1700000000.123', '-62135596800', '253402300799.999']) expect(unixSeconds(parseTimestamp(value, 'seconds'))).toBe(value)
    expect(parseInstant('0099-01-01')).toBe(parseTimestamp('-59042995200', 'seconds'))
    expect(parseInstant('1970-01-01T07:00:00+07:00')).toBe(0)
    expect(parseInstant('1969-12-31T23:59:59.999Z')).toBe(-1)
    expect(parseInstant('2024-02-29T12:34+05:30')).toBe(Date.parse('2024-02-29T07:04:00Z'))
  })
  it.each(['2025-02-29', '2024-04-31', '0000-01-01', '2026-10-05T09:00:00', '2026-10-05T24:00:00Z', '2026-10-05T12:00:60Z', '2026-10-05T12:00:00+24:00', '2026-10-05T12:00:00.1234Z', '10/05/2026'])('rejects ambiguous or impossible dates: %s', (value) => expect(() => parseInstant(value)).toThrow())
  it.each(['NaN', 'Infinity', '1e10', '123abc', '1.2345', '253402300800', '-62135596800.001'])('rejects unbounded/ambiguous seconds: %s', (value) => expect(() => parseTimestamp(value, 'seconds')).toThrow())
  it('does not guess units or silently round milliseconds', () => {
    expect(parseTimestamp('1000', 'milliseconds')).toBe(1000)
    expect(parseTimestamp('1000', 'seconds')).toBe(1_000_000)
    expect(() => parseTimestamp('1.5', 'milliseconds')).toThrow('whole number')
  })
  it('formats a chosen timezone at the instant, including DST transitions', () => {
    expect(formatZonedInstant(0, 'Asia/Ho_Chi_Minh').text).toBe('1970-01-01T08:00:00.000+08:00')
    expect(formatZonedInstant(-1, 'UTC').text).toBe('1969-12-31T23:59:59.999Z')
    expect(formatZonedInstant(parseInstant('2026-03-08T06:30:00Z'), 'America/New_York').offset).toBe('-05:00')
    expect(formatZonedInstant(parseInstant('2026-03-08T07:30:00Z'), 'America/New_York').text).toBe('2026-03-08T03:30:00.000-04:00')
    expect(formatZonedInstant(0, 'Asia/Kolkata').offset).toBe('+05:30')
    expect(() => formatZonedInstant(0, 'invalid/timezone')).toThrow('Unknown timezone')
  })
})

describe('calendar versus elapsed date calculations', () => {
  it('clamps month/year additions to the final valid day', () => {
    expect(addCalendarDate('2024-01-31', 1, 'months')).toBe('2024-02-29')
    expect(addCalendarDate('2025-01-31', 1, 'months')).toBe('2025-02-28')
    expect(addCalendarDate('2024-02-29', 1, 'years')).toBe('2025-02-28')
    expect(addCalendarDate('2026-01-31', -1, 'months')).toBe('2025-12-31')
    expect(addCalendarDate('0099-12-31', 1, 'days')).toBe('0100-01-01')
  })
  it('computes signed date-only boundaries independently of timezone or DST', () => {
    expect(addCalendarDate('2024-02-28', 2, 'days')).toBe('2024-03-01')
    expect(addCalendarDate('2026-03-01', 1, 'weeks')).toBe('2026-03-08')
    expect(calendarDayDifference('2026-03-08', '2026-03-09')).toBe(1)
    expect(calendarDayDifference('2026-03-09', '2026-03-08')).toBe(-1)
    expect(calendarDayDifference('2026-03-08', '2026-03-08')).toBe(0)
  })
  it('keeps elapsed days at 24 hours even across a clock change', () => {
    const start = parseInstant('2026-03-08T00:00:00-05:00')
    const end = parseInstant('2026-03-09T00:00:00-04:00')
    expect(elapsedDifference(start, end)).toBe(23 * 3_600_000)
    expect(describeDuration(elapsedDifference(start, end))).toBe('23h')
    expect(formatZonedInstant(addDuration(start, 1, 'days'), 'America/New_York').text).toBe('2026-03-09T01:00:00.000-04:00')
    expect(describeDuration(-86_461_001)).toBe('−1d 1m 1s 1ms')
    expect(addDuration(0, 0.29, 'hours')).toBe(1_044_000)
    expect(addDuration(0, 0.07, 'days')).toBe(6_048_000)
    expect(addDuration(0, 1e-3, 'seconds')).toBe(1)
  })
  it('rejects fractional calendar steps, invalid dates and out-of-range outputs', () => {
    expect(() => addCalendarDate('2026-01-01', 1.5, 'months')).toThrow()
    expect(() => addCalendarDate('0001-01-01', -1, 'days')).toThrow()
    expect(() => addCalendarDate('9999-12-31', 1, 'years')).toThrow()
    expect(() => calendarDayDifference('2026-02-30', '2026-03-01')).toThrow()
    expect(() => addDuration(0, 0.0001, 'seconds')).toThrow('whole number')
    expect(() => addDuration(0, Number.POSITIVE_INFINITY, 'seconds')).toThrow()
  })
})
