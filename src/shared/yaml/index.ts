import YAML from 'yaml'
import type { JsonValue } from '@shared/json'

export type YamlParseResult =
  | { ok: true; value: JsonValue; text?: string }
  | { ok: false; error: string; line?: number; column?: number }

export function parseYaml(input: string): YamlParseResult {
  try {
    const value = YAML.parse(input) as JsonValue
    return { ok: true, value }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Invalid YAML'
    const line =
      e && typeof e === 'object' && 'linePos' in e
        ? (e as { linePos?: [{ line: number; col: number }] }).linePos?.[0]?.line
        : undefined
    const column =
      e && typeof e === 'object' && 'linePos' in e
        ? (e as { linePos?: [{ line: number; col: number }] }).linePos?.[0]?.col
        : undefined
    return { ok: false, error: message, line, column }
  }
}

export function formatYaml(input: string): YamlParseResult {
  const parsed = parseYaml(input)
  if (!parsed.ok) return parsed
  const text = YAML.stringify(parsed.value, { indent: 2, lineWidth: 0 })
  return { ok: true, value: parsed.value, text }
}

export function yamlToJson(input: string, indent = 2): YamlParseResult {
  const parsed = parseYaml(input)
  if (!parsed.ok) return parsed
  return {
    ok: true,
    value: parsed.value,
    text: JSON.stringify(parsed.value, null, indent)
  }
}

export function jsonToYaml(input: string): YamlParseResult {
  try {
    const value = JSON.parse(input) as JsonValue
    const text = YAML.stringify(value, { indent: 2, lineWidth: 0 })
    return { ok: true, value, text }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Invalid JSON'
    }
  }
}
