import YAML from 'yaml'
import { parseJson, type JsonValue } from '@shared/json'
import { assertStructuredValue, MAX_STRUCTURED_CHARS } from '@shared/json/limits'

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
    checkInput(input)
    const value = YAML.parse(input) as JsonValue
    assertStructuredValue(value)
    return { ok: true, value }
  } catch (e) {
    return yamlError(e)
  }
}

export function formatYaml(input: string): YamlParseResult {
  try {
    checkInput(input)
    const doc = YAML.parseDocument(input)
    if (doc.errors.length) return yamlError(doc.errors[0])
    const value = doc.toJS() as JsonValue
    assertStructuredValue(value)
    return { ok: true, value, text: doc.toString({ indent: 2, lineWidth: 0 }) }
  } catch (e) {
    return yamlError(e)
  }
}

export function yamlToJson(input: string, indent = 2): YamlParseResult {
  const parsed = parseYaml(input)
  if (!parsed.ok) return parsed
  return valueToJson(parsed.value, indent)
}

function valueToJson(value: JsonValue, indent = 2): YamlParseResult {
  try {
    const text = JSON.stringify(value, (_key, value: unknown) => {
      if (typeof value === 'number' && !Number.isFinite(value)) {
        throw new Error('JSON cannot represent NaN or Infinity. Replace them with a number or a quoted string.')
      }
      return value
    }, indent)
    return { ok: true, value, text }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'YAML cannot be represented as JSON', hint: 'JSON cannot represent circular aliases or non-finite numbers.' }
  }
}

function checkInput(input: string): void {
  if (input.length > MAX_STRUCTURED_CHARS) throw new Error('Input exceeds 8 MiB of characters. Split it into smaller documents.')
}

export interface YamlAnalysis { parsed: YamlParseResult; formatted: YamlParseResult; asJson: YamlParseResult }
/** One parse and one conversion; preserves comments and aliases in formatted YAML. */
export function analyzeYaml(input: string): YamlAnalysis {
  try {
    checkInput(input)
    const doc = YAML.parseDocument(input)
    if (doc.errors.length) throw doc.errors[0]
    const value = doc.toJS() as JsonValue
    assertStructuredValue(value)
    const parsed: YamlParseResult = { ok: true, value }
    return { parsed, formatted: { ...parsed, text: doc.toString({ indent: 2, lineWidth: 0 }) }, asJson: valueToJson(value) }
  } catch (error) {
    const issue = yamlError(error)
    return { parsed: issue, formatted: issue, asJson: issue }
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
