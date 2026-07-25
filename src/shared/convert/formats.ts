import YAML from 'yaml'
import type { JsonValue } from '../json'

export type FormatId = 'json' | 'yaml'

export interface FormatAdapter {
  id: FormatId
  label: string
  extensions: string[]
  language: 'json' | 'yaml' | 'text'
  parse: (text: string) => { ok: true; value: JsonValue } | { ok: false; error: string }
  stringify: (value: JsonValue, options?: { indent?: number }) => string
}

const jsonAdapter: FormatAdapter = {
  id: 'json',
  label: 'JSON',
  extensions: ['.json'],
  language: 'json',
  parse: (text) => {
    try {
      return { ok: true, value: JSON.parse(text) as JsonValue }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Invalid JSON' }
    }
  },
  stringify: (value, options) => JSON.stringify(value, null, options?.indent ?? 2)
}

const yamlAdapter: FormatAdapter = {
  id: 'yaml',
  label: 'YAML',
  extensions: ['.yaml', '.yml'],
  language: 'yaml',
  parse: (text) => {
    try {
      return { ok: true, value: YAML.parse(text) as JsonValue }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Invalid YAML' }
    }
  },
  stringify: (value) => YAML.stringify(value, { indent: 2, lineWidth: 0 })
}

export const formatAdapters: FormatAdapter[] = [jsonAdapter, yamlAdapter]

export function getFormat(id: FormatId): FormatAdapter {
  const f = formatAdapters.find((a) => a.id === id)
  if (!f) throw new Error(`Unknown format: ${id}`)
  return f
}

export function convertFormat(
  text: string,
  from: FormatId,
  to: FormatId,
  options?: { indent?: number }
): { ok: true; text: string; value: JsonValue } | { ok: false; error: string } {
  const source = getFormat(from)
  const target = getFormat(to)
  const parsed = source.parse(text)
  if (!parsed.ok) return parsed
  return {
    ok: true,
    value: parsed.value,
    text: target.stringify(parsed.value, options)
  }
}

export function detectFormat(text: string, filename?: string): FormatId | null {
  if (filename) {
    const lower = filename.toLowerCase()
    for (const a of formatAdapters) {
      if (a.extensions.some((ext) => lower.endsWith(ext))) return a.id
    }
  }
  const t = text.trim()
  if (!t) return null
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      JSON.parse(t)
      return 'json'
    } catch {
      /* try yaml */
    }
  }
  try {
    YAML.parse(t)
    return 'yaml'
  } catch {
    return null
  }
}
