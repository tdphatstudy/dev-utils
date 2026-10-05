export type CronStartResult = { ok: true; date: Date } | { ok: false; error: string }

/** Validate calendar fields before Date can normalize an impossible day/hour. */
export function parseCronStart(input: string): CronStartResult {
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(input)
  if (!parts) return { ok: false, error: 'Use YYYY-MM-DDTHH:mm:ss with Z or a UTC offset (for example 2026-10-04T12:00:00+07:00). Fractional seconds support 1–3 digits.' }
  const year = Number(parts[1]), month = Number(parts[2]), day = Number(parts[3])
  if (month < 1 || month > 12) return { ok: false, error: 'Start month must be from 01 to 12.' }
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
  if (day < 1 || day > days) return { ok: false, error: `${parts[1]}-${parts[2]} has ${days} days; start day must be from 01 to ${days}.` }
  if (Number(parts[4]) > 23) return { ok: false, error: 'Start hour must be from 00 to 23; 24:00 is not supported.' }
  if (Number(parts[5]) > 59) return { ok: false, error: 'Start minute must be from 00 to 59.' }
  if (Number(parts[6]) > 59) return { ok: false, error: 'Start second must be from 00 to 59; leap seconds are not supported.' }
  if (parts[8] !== 'Z' && (Number(parts[10]) > 23 || Number(parts[11]) > 59)) {
    return { ok: false, error: 'UTC offset must have hours from 00 to 23 and minutes from 00 to 59.' }
  }
  const date = new Date(input)
  return Number.isFinite(date.getTime()) ? { ok: true, date } : { ok: false, error: 'Start timestamp is outside the supported date range.' }
}
