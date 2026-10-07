import { assertJsonInput } from '../json/limits'
import YAML from 'yaml'

export const MAX_ANALYSIS_CHARS = 2 * 1024 * 1024
export const MAX_ANALYSIS_ROWS = 20000
export const MAX_REPORT_ROWS = 1000
export type RecordValue = Record<string, unknown>
export const isRecord = (value: unknown): value is RecordValue => value !== null && typeof value === 'object' && !Array.isArray(value)
export const own = (value: RecordValue, key: string): unknown => Object.hasOwn(value, key) ? value[key] : undefined
export const pointerEscape = (value: string): string => value.replaceAll('~', '~0').replaceAll('/', '~1')

export function boundInput(input: string): void {
  if (input.length > MAX_ANALYSIS_CHARS) throw new Error('Input exceeds 2 Mi characters. Split it into smaller documents.')
  if (!input.trim()) throw new Error('Provide an input document first.')
}

export function boundValue(value: unknown): void {
  let nodes = 0
  const active = new Set<object>()
  const visit = (item: unknown, depth: number): void => {
    if (++nodes > 100000 || depth > 64) throw new Error('Document exceeds 100,000 values or 64 nesting levels.')
    if (typeof item === 'number' && (!Number.isFinite(item) || (Number.isInteger(item) && !Number.isSafeInteger(item)))) throw new Error('Unsafe integer or non-finite number. Quote large identifiers to preserve them.')
    if (item === null || ['string', 'number', 'boolean'].includes(typeof item)) return
    if (typeof item !== 'object') throw new Error('Only JSON-compatible values are supported.')
    if (active.has(item)) throw new Error('Circular aliases are unsupported.')
    if (!Array.isArray(item)) {
      const prototype = Object.getPrototypeOf(item)
      if (prototype !== null && prototype !== Object.prototype) throw new Error('Only plain JSON objects are supported; maps, dates and custom objects must be converted first.')
      // The schema engine uses `in` for required/properties. Remove inherited names
      // so constructor/toString cannot satisfy absent JSON fields.
      Object.setPrototypeOf(item, null)
    }
    active.add(item)
    for (const child of Object.values(item)) visit(child, depth + 1)
    active.delete(item)
  }
  visit(value, 0)
}

export function parseJsonDocument(input: string): unknown {
  boundInput(input)
  assertJsonInput(input)
  let value: unknown
  try { value = JSON.parse(input) }
  catch { throw new Error('Invalid JSON. Check quoting, commas and brackets; input values are omitted from errors.') }
  // JSON.parse silently accepts duplicate names. Reject before a comparison can hide data.
  const stack: (Set<string> | null)[] = []
  const tokens = /"(?:[^"\\]|\\[\s\S])*"|[{}\[\]]/g
  for (const token of input.matchAll(tokens)) {
    const text = token[0]
    if (text === '{') stack.push(new Set())
    else if (text === '[') stack.push(null)
    else if (text === '}' || text === ']') stack.pop()
    else if (stack.at(-1)) {
      let end = token.index! + text.length
      while (end < input.length && /[\t\n\r ]/.test(input[end])) end++
      if (input[end] !== ':') continue
      const key = JSON.parse(text) as string, keys = stack.at(-1)!
      if (keys.has(key)) throw new Error('Duplicate JSON property names are unsupported. Remove duplicates before analysis.')
      keys.add(key)
    }
  }
  boundValue(value)
  return value
}

export function parseContract(input: string): RecordValue {
  boundInput(input)
  let value: unknown
  if (/^[\s]*[\[{]/.test(input)) value = parseJsonDocument(input)
  else {
    try {
      const document = YAML.parseDocument(input, { uniqueKeys: true })
      if (document.errors.length || document.warnings.length) throw new Error('syntax')
      value = document.toJS({ maxAliasCount: 50 })
    } catch { throw new Error('Invalid or unsupported YAML. Check duplicate keys, indentation and aliases; input values are omitted from errors.') }
    boundValue(value)
  }
  if (!isRecord(value)) throw new Error('Expected a JSON/YAML object.')
  return value
}

export function canonical(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (isRecord(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}'
  return JSON.stringify(value)
}

/** RFC 6901 pointer, with own-property lookup; never resolves files, URLs or prototypes. */
export function atPointer(value: unknown, pointer: string): unknown {
  if (!pointer) return value
  if (!pointer.startsWith('/') || /~(?![01])/u.test(pointer)) throw new Error('Use a JSON Pointer such as /id or /customer/id; escape ~ as ~0 and / as ~1.')
  for (const segment of pointer.slice(1).split('/')) {
    const key = segment.replaceAll('~1', '/').replaceAll('~0', '~')
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) return undefined
    value = (value as RecordValue)[key]
  }
  return value
}
