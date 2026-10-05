import { describe, expect, it } from 'vitest'
import { parseCronStart } from './start-time'
import { nextRuns, parseCron } from './index'

describe('cron start time', () => {
  it('refuses impossible calendar days instead of normalizing into another month', () => {
    for (const input of ['2025-02-29T00:00:00Z', '2024-02-30T00:00:00Z', '1900-02-29T12:00:00+07:00', '2026-04-31T10:00:00-04:00', '2026-01-00T00:00:00Z', '2026-13-01T00:00:00Z']) {
      expect(parseCronStart(input)).toMatchObject({ ok: false, error: expect.any(String) })
    }
    expect(parseCronStart('2025-02-29T00:00:00Z')).toMatchObject({ error: expect.stringContaining('28 days') })
  })
  it('accepts leap years, exact milliseconds and explicit positive/negative offsets', () => {
    for (const [input, iso] of [
      ['2000-02-29T12:00:00Z', '2000-02-29T12:00:00.000Z'],
      ['2024-02-29T12:00:00.25+07:00', '2024-02-29T05:00:00.250Z'],
      ['2026-10-04T12:00:00.001-04:30', '2026-10-04T16:30:00.001Z'],
      ['0000-02-29T00:00:00Z', '0000-02-29T00:00:00.000Z']
    ]) {
      const result = parseCronStart(input)
      if (!result.ok) throw new Error(result.error)
      expect(result.date.toISOString()).toBe(iso)
    }
  })
  it('refuses normalized hours, unsupported seconds/precision and ambiguous timezone inputs', () => {
    for (const input of ['2026-10-04T24:00:00Z', '2026-10-04T12:60:00Z', '2026-10-04T12:00:60Z', '2026-10-04T12:00:00.0001Z', '2026-10-04T12:00:00+24:00', '2026-10-04T12:00:00+07:60', '2026-10-04T12:00:00', '10/04/2026', ' 2026-10-04T12:00:00Z']) {
      expect(parseCronStart(input).ok).toBe(false)
    }
  })
  it('uses the validated offset instant as the strict lower bound for the next run', () => {
    const start = parseCronStart('2026-10-04T12:00:00.001+07:00')
    const cron = parseCron('* * * * * *')
    if (!start.ok || !cron.ok) throw new Error('Invalid fixture')
    expect(nextRuns(cron, start.date, 1, { timezone: 'UTC' })[0].toISOString()).toBe('2026-10-04T05:00:01.000Z')
  })
})
