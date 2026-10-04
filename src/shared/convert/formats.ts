import YAML from 'yaml'
import { parseJson, type JsonValue } from '@shared/json'
import { formatYaml, parseYaml, yamlToJson } from '@shared/yaml'

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
  parse: parseJson,
  stringify: (value, options) => JSON.stringify(value, null, options?.indent ?? 2)
}

const yamlAdapter: FormatAdapter = {
  id: 'yaml',
  label: 'YAML',
  extensions: ['.yaml', '.yml'],
  language: 'yaml',
  parse: parseYaml,
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
  if (!text.trim()) return { ok: false, error: 'Paste text or open a file to convert.' }
  if (from === 'yaml' && to === 'json') {
    const result = yamlToJson(text, options?.indent)
    return result.ok ? { ok: true, value: result.value, text: result.text ?? '' } : result
  }
  if (from === 'yaml' && to === 'yaml') {
    const result = formatYaml(text)
    return result.ok ? { ok: true, value: result.value, text: result.text ?? '' } : result
  }
  const source = getFormat(from)
  const target = getFormat(to)
  const parsed = source.parse(text)
  if (!parsed.ok) return parsed
  try {
    return { ok: true, value: parsed.value, text: target.stringify(parsed.value, options) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not convert this document.' }
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
  if (parseJson(t).ok) return 'json'
  try {
    YAML.parse(t)
    return 'yaml'
  } catch {
    return null
  }
}
