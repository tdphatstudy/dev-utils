import { atPointer, boundInput, isRecord, MAX_ANALYSIS_ROWS, parseJsonDocument } from './common'
import { format } from '@cfworker/json-schema'

export interface LogFields { level: string; service: string; trace: string; duration: string; timestamp: string }
export interface LogFilters { level: string; service: string; trace: string; from: string; to: string }
export interface LogRow { line: number; level: string; service: string; trace: string; timestamp: string; duration?: number }
export interface LogResult { total: number; matched: number; invalidLines: number[]; invalidCount: number; rows: LogRow[]; levels: { name: string; count: number }[]; services: { name: string; count: number }[]; errors: number; latency: { samples: number; p50?: number; p95?: number; p99?: number; max?: number }; truncated: boolean }
export const DEFAULT_LOG_FIELDS: LogFields = { level: '/level', service: '/service', trace: '/traceId', duration: '/durationMs', timestamp: '/timestamp' }
const label = (value: unknown): string => typeof value === 'string' || typeof value === 'number' ? String(value) : ''
const levelName = (value: unknown): string => {
  if (typeof value === 'number') return ({ 10: 'trace', 20: 'debug', 30: 'info', 40: 'warn', 50: 'error', 60: 'fatal' } as Record<number, string>)[value] ?? String(value)
  const text = label(value).toLowerCase()
  return text === 'warning' ? 'warn' : text === 'err' ? 'error' : text
}

export function analyzeLogs(input: string, fields: LogFields, filters: LogFilters): LogResult {
  boundInput(input)
  for (const pointer of Object.values(fields)) atPointer({}, pointer)
  const lines = input.split(/\r?\n/)
  if (lines.length > MAX_ANALYSIS_ROWS) throw new Error('At most 20,000 JSONL lines are supported.')
  const parseDate = (value: string): number | undefined => {
    if (!value) return undefined
    // Require a timezone to avoid silently interpreting a production incident in local time.
    if (!format['date-time'](value) || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('Time filters require valid ISO timestamps with Z or an explicit offset.')
    return Date.parse(value)
  }
  const from = parseDate(filters.from), to = parseDate(filters.to)
  if (from !== undefined && to !== undefined && from > to) throw new Error('Start time must be before end time.')
  const rows: LogRow[] = [], invalidLines: number[] = [], durations: number[] = [], levels = new Map<string, number>(), services = new Map<string, number>()
  let total = 0, matched = 0, errors = 0, invalidCount = 0
  lines.forEach((line, index) => {
    if (!line.trim()) return
    let value: unknown
    try { value = parseJsonDocument(line); if (!isRecord(value)) throw new Error('object') }
    catch { invalidCount++; if (invalidLines.length < 100) invalidLines.push(index + 1); return }
    total++
    const row: LogRow = { line: index + 1, level: levelName(atPointer(value, fields.level)), service: label(atPointer(value, fields.service)), trace: label(atPointer(value, fields.trace)), timestamp: label(atPointer(value, fields.timestamp)) }
    const duration = atPointer(value, fields.duration)
    if (typeof duration === 'number' && Number.isFinite(duration) && duration >= 0) row.duration = duration
    const time = Date.parse(row.timestamp)
    if ((filters.level && row.level !== filters.level.toLowerCase()) || (filters.service && row.service !== filters.service) || (filters.trace && row.trace !== filters.trace) || ((from !== undefined || to !== undefined) && (!format['date-time'](row.timestamp) || !/(?:Z|[+-]\d{2}:\d{2})$/.test(row.timestamp) || !Number.isFinite(time))) || (from !== undefined && time < from) || (to !== undefined && time > to)) return
    matched++
    if (row.level === 'error' || row.level === 'fatal') errors++
    levels.set(row.level || '(missing)', (levels.get(row.level || '(missing)') ?? 0) + 1)
    services.set(row.service || '(missing)', (services.get(row.service || '(missing)') ?? 0) + 1)
    if (row.duration !== undefined) durations.push(row.duration)
    if (rows.length < 500) rows.push(row)
  })
  durations.sort((a, b) => a - b)
  const percentile = (p: number): number | undefined => durations.length ? durations[Math.max(0, Math.ceil(p * durations.length) - 1)] : undefined
  const groups = (map: Map<string, number>): { name: string; count: number }[] => [...map].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 100)
  return { total, matched, invalidLines, invalidCount, rows, levels: groups(levels), services: groups(services), errors, latency: { samples: durations.length, p50: percentile(.5), p95: percentile(.95), p99: percentile(.99), max: durations.at(-1) }, truncated: matched > rows.length }
}
