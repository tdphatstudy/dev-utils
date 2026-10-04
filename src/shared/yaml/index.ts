import YAML from 'yaml'
import { parseJson, type JsonValue } from '@shared/json'

export type YamlParseResult =
  | { ok: true; value: JsonValue; text?: string }
  | { ok: false; error: string; line?: number; column?: number; offset?: number; hint?: string }

function yamlError(e: unknown): Extract<YamlParseResult, { ok: false }> {
  const issue = e as { message?: string; linePos?: [{ line: number; col: number }]; pos?: [number, number] }
  return {
    ok: false,
    error: issue?.message?.split(/\n/)[0] ?? 'Invalid YAML',
    line: issue?.linePos?.[0]?.line,
    column: issue?.linePos?.[0]?.col,
    offset: issue?.pos?.[0],
    hint: 'Check indentation, duplicate keys and unclosed quotes or brackets.'
  }
}

export function parseYaml(input: string): YamlParseResult {
  try {
    const value = YAML.parse(input) as JsonValue
    return { ok: true, value }
  } catch (e) {
    return yamlError(e)
  }
}

export function formatYaml(input: string): YamlParseResult {
  try {
    const doc = YAML.parseDocument(input)
    if (doc.errors.length) return yamlError(doc.errors[0])
    return { ok: true, value: doc.toJS() as JsonValue, text: doc.toString({ indent: 2, lineWidth: 0 }) }
  } catch (e) {
    return yamlError(e)
  }
}

export function yamlToJson(input: string, indent = 2): YamlParseResult {
  const parsed = parseYaml(input)
  if (!parsed.ok) return parsed
  try {
    const text = JSON.stringify(parsed.value, (_key, value: unknown) => {
      if (typeof value === 'number' && !Number.isFinite(value)) {
        throw new Error('JSON cannot represent NaN or Infinity. Replace them with a number or a quoted string.')
      }
      return value
    }, indent)
    return { ok: true, value: parsed.value, text }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'YAML cannot be represented as JSON', hint: 'JSON cannot represent circular aliases or non-finite numbers.' }
  }
}

export function jsonToYaml(input: string): YamlParseResult {
  const parsed = parseJson(input)
  if (!parsed.ok) return parsed
  try {
    const value = parsed.value
    const text = YAML.stringify(value, { indent: 2, lineWidth: 0 })
    return { ok: true, value, text }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Invalid JSON'
    }
  }
}
