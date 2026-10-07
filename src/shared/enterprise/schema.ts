import { Validator, format, type Schema, type SchemaDraft } from '@cfworker/json-schema'
import { atPointer, canonical, isRecord, parseJsonDocument, pointerEscape } from './common'

export type SupportedDraft = '7' | '2020-12'
export interface SchemaIssue { instancePath: string; schemaPath: string; keyword: string; message: string }
export interface SchemaResult { valid: boolean; draft: SupportedDraft; errors: SchemaIssue[]; truncated: boolean }

const annotations = new Set(['title', 'description', 'default', 'examples', '$comment', 'readOnly', 'writeOnly', 'deprecated'])
const single = new Set(['not', 'if', 'then', 'else', 'contains', 'propertyNames', 'additionalProperties', 'additionalItems', 'unevaluatedProperties', 'unevaluatedItems'])
const maps = new Set(['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas'])
const lists = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems'])
const sizes = new Set(['minLength', 'maxLength', 'minItems', 'maxItems', 'minProperties', 'maxProperties', 'minContains', 'maxContains'])
const numbers = new Set(['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf'])
const formats = new Set(Object.keys(format))

/** A strict local profile: refuse unsupported constraints instead of silently passing them. */
function checkSchema(root: unknown, draft: SupportedDraft): void {
  const refs: string[] = []
  const schemaPaths = new Set<string>()
  const invalid = (path: string, keyword: string): never => { throw new Error(`Invalid or unsupported schema keyword ${keyword} at ${path || '/'}. Schema values are omitted.`) }
  const visit = (value: unknown, path: string): void => {
    schemaPaths.add(path)
    if (typeof value === 'boolean') return
    if (!isRecord(value)) invalid(path, 'schema')
    const schema = value as Record<string, unknown>
    for (const [key, item] of Object.entries(schema)) {
      if (annotations.has(key)) continue
      if (key.startsWith('__')) invalid(path, key)
      if (draft === '7' && ['prefixItems', 'unevaluatedItems', 'unevaluatedProperties', 'dependentSchemas', 'dependentRequired', 'minContains', 'maxContains'].includes(key)) invalid(path, key)
      if (draft === '2020-12' && ['additionalItems', 'dependencies'].includes(key)) invalid(path, key)
      const next = path + '/' + pointerEscape(key)
      if (single.has(key)) visit(item, next)
      else if (maps.has(key)) {
        if (!isRecord(item)) invalid(path, key)
        for (const [name, child] of Object.entries(item as Record<string, unknown>)) {
          if (key === 'patternProperties') { try { new RegExp(name, 'u') } catch { invalid(path, key) } }
          visit(child, next + '/' + pointerEscape(name))
        }
      } else if (lists.has(key) || (key === 'items' && Array.isArray(item))) {
        if (!Array.isArray(item) || ((key === 'items') && draft === '2020-12') || (key !== 'items' && key !== 'prefixItems' && !item.length)) invalid(path, key)
        for (const [index, child] of (item as unknown[]).entries()) visit(child, next + '/' + index)
      } else if (key === 'items') visit(item, next)
      else if (sizes.has(key)) { if (typeof item !== 'number' || !Number.isInteger(item) || item < 0) invalid(path, key) }
      else if (numbers.has(key)) { if (typeof item !== 'number' || !Number.isFinite(item) || (key === 'multipleOf' && item <= 0)) invalid(path, key) }
      else if (key === 'type') {
        const values = Array.isArray(item) ? item : [item]
        if (!values.length || new Set(values).size !== values.length || values.some(type => !['null', 'boolean', 'object', 'array', 'number', 'string', 'integer'].includes(type as string))) invalid(path, key)
      } else if (key === 'required') {
        if (!Array.isArray(item) || item.some(name => typeof name !== 'string') || new Set(item).size !== item.length) invalid(path, key)
      } else if (key === 'enum') {
        if (!Array.isArray(item) || !item.length || new Set(item.map(canonical)).size !== item.length) invalid(path, key)
      } else if (key === 'const') continue
      else if (key === 'uniqueItems') { if (typeof item !== 'boolean') invalid(path, key) }
      else if (key === 'pattern') { if (typeof item !== 'string') invalid(path, key); try { new RegExp(item as string, 'u') } catch { invalid(path, key) } }
      else if (key === 'format') { if (typeof item !== 'string' || !formats.has(item)) invalid(path, key) }
      else if (key === '$ref') {
        if (typeof item !== 'string' || (item !== '#' && !item.startsWith('#/')) || item.includes('%')) invalid(path, key)
        refs.push(item as string)
      } else if (key === '$id') {
        // Nested IDs change reference scope. Keep this tool's local-pointer semantics explicit.
        if (path || typeof item !== 'string' || !/^https?:\/\/[^#]+$/.test(item)) invalid(path, key)
      } else if (key === '$schema') {
        const expected = draft === '7' ? /^https?:\/\/json-schema.org\/draft-07\/schema#?$/ : /^https?:\/\/json-schema.org\/draft\/2020-12\/schema#?$/
        if (typeof item !== 'string' || !expected.test(item)) invalid(path, key)
      } else if (key === 'dependentRequired' || key === 'dependencies') {
        if (!isRecord(item)) invalid(path, key)
        for (const [name, child] of Object.entries(item as Record<string, unknown>)) {
          if (Array.isArray(child)) { if (child.some(entry => typeof entry !== 'string') || new Set(child).size !== child.length) invalid(path, key) }
          else if (key === 'dependencies') visit(child, next + '/' + pointerEscape(name))
          else invalid(path, key)
        }
      } else invalid(path, key)
    }
  }
  visit(root, '')
  for (const ref of refs) {
    const value = atPointer(root, ref.slice(1))
    if (value === undefined || !schemaPaths.has(ref.slice(1)) || (!isRecord(value) && typeof value !== 'boolean')) throw new Error('A local $ref does not point to a schema. External references are never fetched.')
  }
}

export function validatePayload(schemaText: string, payloadText: string, draft: SupportedDraft): SchemaResult {
  if (draft !== '7' && draft !== '2020-12') throw new Error('Choose draft 7 or 2020-12.')
  const schema = parseJsonDocument(schemaText), payload = parseJsonDocument(payloadText)
  checkSchema(schema, draft)
  // The interpreter does not eval code or fetch refs. Run this function in the bounded renderer worker.
  let result
  // Fail fast bounds diagnostic allocation for hostile combinator/array schemas.
  try { result = new Validator(schema as Schema | boolean, draft as SchemaDraft, true).validate(payload) }
  catch { throw new Error('Schema evaluation failed. Check local references and recursive constraints; no input values are included.') }
  return {
    valid: result.valid, draft, truncated: result.errors.length > 200,
    errors: result.errors.slice(0, 200).map(error => ({ instancePath: error.instanceLocation || '/', schemaPath: error.keywordLocation || '/', keyword: error.keyword, message: `Constraint ${error.keyword} failed.` }))
  }
}
