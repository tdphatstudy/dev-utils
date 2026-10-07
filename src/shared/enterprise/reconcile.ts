import { atPointer, canonical, isRecord, MAX_ANALYSIS_ROWS, MAX_REPORT_ROWS, parseJsonDocument, pointerEscape } from './common'

export interface ReconcileRow { baselineRow?: number; targetRow?: number; status: 'same' | 'changed' | 'missing' | 'extra' | 'duplicate'; fields: string[]; changedFieldCount?: number }
export interface ReconcileResult { counts: Record<ReconcileRow['status'], number>; rows: ReconcileRow[]; totalRows: number; truncated: boolean }

export function reconcileData(baselineText: string, targetText: string, keyPointer: string, ignoredText = ''): ReconcileResult {
  if (!keyPointer) throw new Error('Provide a non-empty key JSON Pointer.')
  const ignored = ignoredText.split('\n').map(value => value.trim()).filter(Boolean)
  if (ignored.length > 50) throw new Error('At most 50 ignored field pointers are supported.')
  for (const pointer of [keyPointer, ...ignored]) atPointer({}, pointer)
  const load = (text: string, side: string): Map<string, { row: number; value: Record<string, unknown> }[]> => {
    const data = parseJsonDocument(text)
    if (!Array.isArray(data) || data.length > MAX_ANALYSIS_ROWS) throw new Error(`${side}: expected a JSON array of at most 20,000 objects.`)
    const map = new Map<string, { row: number; value: Record<string, unknown> }[]>()
    data.forEach((value: unknown, index: number) => {
      if (!isRecord(value)) throw new Error(`${side}: row ${index + 1} must be an object.`)
      const key = atPointer(value, keyPointer)
      if (!(typeof key === 'string' || typeof key === 'number') || key === '') throw new Error(`${side}: row ${index + 1} needs a non-empty string or number key.`)
      const encoded = canonical(key), items = map.get(encoded) ?? []
      items.push({ row: index + 1, value }); map.set(encoded, items)
    })
    return map
  }
  const baseline = load(baselineText, 'Baseline'), target = load(targetText, 'Target')
  const counts = { same: 0, changed: 0, missing: 0, extra: 0, duplicate: 0 }, rows: ReconcileRow[] = []
  let totalRows = 0
  const emit = (row: ReconcileRow): void => { counts[row.status]++; totalRows++; if (rows.length < MAX_REPORT_ROWS) rows.push(row) }
  for (const key of new Set([...baseline.keys(), ...target.keys()])) {
    const left = baseline.get(key) ?? [], right = target.get(key) ?? []
    if (left.length > 1 || right.length > 1) {
      for (const item of left) emit({ baselineRow: item.row, status: 'duplicate', fields: [] })
      for (const item of right) emit({ targetRow: item.row, status: 'duplicate', fields: [] })
      continue
    }
    if (!left.length) { emit({ targetRow: right[0].row, status: 'extra', fields: [] }); continue }
    if (!right.length) { emit({ baselineRow: left[0].row, status: 'missing', fields: [] }); continue }
    const fields: string[] = []
    const walk = (a: unknown, b: unknown, pointer: string): void => {
      if (ignored.some(skip => pointer === skip || pointer.startsWith(skip + '/'))) return
      if (isRecord(a) && isRecord(b)) {
        for (const name of new Set([...Object.keys(a), ...Object.keys(b)])) walk(Object.hasOwn(a, name) ? a[name] : undefined, Object.hasOwn(b, name) ? b[name] : undefined, pointer + '/' + pointerEscape(name))
      } else if (canonical(a) !== canonical(b)) fields.push(pointer || '/')
    }
    walk(left[0].value, right[0].value, '')
    emit({ baselineRow: left[0].row, targetRow: right[0].row, status: fields.length ? 'changed' : 'same', fields: fields.slice(0, 100), changedFieldCount: fields.length })
  }
  return { counts, rows, totalRows, truncated: totalRows > rows.length }
}
