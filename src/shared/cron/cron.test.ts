import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatCronDate, nextRuns, parseCron } from './index'
afterEach(() => vi.unstubAllEnvs())

describe('parseCron', () => {
  it('parses 5-field every minute', () => {
    const p = parseCron('* * * * *')
    expect(p.ok).toBe(true)
    if (!p.ok) return
    expect(p.hasSeconds).toBe(false)
    expect(p.fields.find((f) => f.name === 'minute')!.values).toHaveLength(60)
  })

  it('parses step and range', () => {
    const p = parseCron('*/15 9-17 * * 1-5')
    expect(p.ok).toBe(true)
    if (!p.ok) return
    expect(p.fields.find((f) => f.name === 'minute')!.values).toEqual([0, 15, 30, 45])
    expect(p.fields.find((f) => f.name === 'hour')!.values[0]).toBe(9)
    expect(p.fields.find((f) => f.name === 'dayOfWeek')!.values).toEqual([1, 2, 3, 4, 5])
  })

  it('parses 6-field with seconds', () => {
    const p = parseCron('*/30 * * * * *')
    expect(p.ok).toBe(true)
    if (!p.ok) return
    expect(p.hasSeconds).toBe(true)
    expect(p.fields.find((f) => f.name === 'second')!.values).toEqual([0, 30])
  })

  it('rejects bad field count', () => {
    const p = parseCron('* * *')
    expect(p.ok).toBe(false)
  })

  it('accepts month names', () => {
    const p = parseCron('0 0 1 JAN *')
    expect(p.ok).toBe(true)
    if (!p.ok) return
    expect(p.fields.find((f) => f.name === 'month')!.values).toEqual([1])
  })
  it('rejects coercible numbers and extra separators with a field and column', () => {
    for (const expression of ['0x10 * * * *', '1e1 * * * *', '*/2/3 * * * *', '1-2-3 * * * *', '0 0 * constructor *', '0 0 * * MON#2']) {
      const parsed = parseCron(expression)
      expect(parsed.ok).toBe(false)
      if (!parsed.ok) expect(parsed.column).toBeGreaterThan(0)
    }
    expect(parseCron('0 0 * * 5-7')).toMatchObject({ ok: true, fields: expect.arrayContaining([expect.objectContaining({ name: 'dayOfWeek', values: [0, 5, 6] })]) })
    expect(parseCron('0 0 * * 0-7/2')).toMatchObject({ ok: true, fields: expect.arrayContaining([expect.objectContaining({ name: 'dayOfWeek', values: [0, 2, 4, 6] })]) })
  })
  it('describes every-second expressions honestly', () => {
    const parsed = parseCron('* * * * * *')
    expect(parsed.ok && parsed.human).toContain('seconds 0, 1')
  })
})

describe('nextRuns', () => {
  it('finds next daily midnight runs', () => {
    const p = parseCron('0 0 * * *')
    expect(p.ok).toBe(true)
    if (!p.ok) return
    const from = new Date('2024-01-01T12:00:00')
    const runs = nextRuns(p, from, 3)
    expect(runs).toHaveLength(3)
    expect(formatCronDate(runs[0]!)).toContain('2024-01-02 00:00:00')
    expect(runs[1]!.getDate()).toBe(3)
  })

  it('respects weekdays', () => {
    const p = parseCron('0 9 * * 1-5')
    expect(p.ok).toBe(true)
    if (!p.ok) return
    // 2024-01-06 is Saturday
    const from = new Date('2024-01-06T08:00:00')
    const runs = nextRuns(p, from, 1)
    expect(runs[0]!.getDay()).toBeGreaterThanOrEqual(1)
    expect(runs[0]!.getDay()).toBeLessThanOrEqual(5)
    expect(runs[0]!.getHours()).toBe(9)
  })
  it('never returns a time before a fractional-second start, even inclusive', () => {
    const parsed = parseCron('* * * * * *')
    if (!parsed.ok) throw new Error(parsed.error)
    expect(nextRuns(parsed, new Date('2024-01-01T00:00:00.500Z'), 1, { inclusive: true, timezone: 'UTC' })[0]?.toISOString()).toBe('2024-01-01T00:00:01.000Z')
    expect(nextRuns(parsed, new Date('2024-01-01T00:00:00Z'), 1, { inclusive: true, timezone: 'UTC' })[0]?.toISOString()).toBe('2024-01-01T00:00:00.000Z')
  })
  it('finds leap-day runs beyond two years and detects impossible dates efficiently', () => {
    const leap = parseCron('0 0 29 FEB *'), impossible = parseCron('1 0 0 31 FEB *')
    if (!leap.ok || !impossible.ok) throw new Error('Fixture invalid')
    expect(nextRuns(leap, new Date('2025-01-01T00:00:00Z'), 1, { timezone: 'UTC' })[0]?.toISOString()).toBe('2028-02-29T00:00:00.000Z')
    expect(nextRuns(impossible, new Date('2025-01-01T00:00:00Z'), 1, { timezone: 'UTC' })).toEqual([])
  })
  it('uses wildcard-leading day-field semantics and OR for two restricted days', () => {
    const wildcard = parseCron('0 0 */2 * MON'), restricted = parseCron('0 0 1 * MON')
    if (!wildcard.ok || !restricted.ok) throw new Error('Fixture invalid')
    expect(nextRuns(wildcard, new Date('2024-01-01T00:00:00Z'), 1, { timezone: 'UTC' })[0]?.toISOString()).toBe('2024-01-15T00:00:00.000Z')
    expect(nextRuns(restricted, new Date('2024-01-01T00:00:00Z'), 1, { timezone: 'UTC' })[0]?.toISOString()).toBe('2024-01-08T00:00:00.000Z')
  })
  it('skips missing DST times and preserves both repeated wall times', () => {
    vi.stubEnv('TZ', 'America/New_York')
    const spring = parseCron('0 2 * * *'), fall = parseCron('30 1 * * *')
    if (!spring.ok || !fall.ok) throw new Error('Fixture invalid')
    expect(nextRuns(spring, new Date('2024-03-10T05:00:00Z'), 1)[0]?.toISOString()).toBe('2024-03-11T06:00:00.000Z')
    expect(nextRuns(fall, new Date('2024-11-03T04:00:00Z'), 2).map((date) => date.toISOString())).toEqual(['2024-11-03T05:30:00.000Z', '2024-11-03T06:30:00.000Z'])
  })
})
