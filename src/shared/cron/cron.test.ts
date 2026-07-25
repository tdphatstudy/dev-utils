import { describe, expect, it } from 'vitest'
import { formatCronDate, nextRuns, parseCron } from './index'

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
})
