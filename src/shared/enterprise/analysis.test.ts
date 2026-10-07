import { describe, expect, it } from 'vitest'
import { atPointer, canonical, MAX_ANALYSIS_CHARS, parseContract, parseJsonDocument } from './common'
import { validatePayload } from './schema'
import { reconcileData } from './reconcile'
import { reviewContract } from './openapi'
import { analyzeLogs, DEFAULT_LOG_FIELDS } from './logs'
import { CONTRACT_BASE_EXAMPLE, CONTRACT_TARGET_EXAMPLE, LOG_EXAMPLE, PAYLOAD_EXAMPLE, RECONCILE_BASE_EXAMPLE, RECONCILE_TARGET_EXAMPLE, SCHEMA_EXAMPLE } from './examples'

const json = JSON.stringify
const validate = (schema: unknown, payload: unknown) => validatePayload(json(schema), json(payload), '2020-12')
const api = (operation: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => json({ openapi: '3.1.0', info: { title: 'Fixture', version: '1' }, security: [{ token: [] }], paths: { '/items': { get: { operationId: 'getItems', responses: { '200': { description: 'OK' } }, ...operation } } }, ...extra })
const filters = { level: '', service: '', trace: '', from: '', to: '' }

describe('bounded local parsing', () => {
  it('rejects duplicates including escaped names without echoing values', () => {
    expect(() => parseJsonDocument('{"id":"private-fixture","\\u0069d":"other"}')).toThrow('Duplicate')
    expect(() => parseJsonDocument('{"token":"private-fixture" garbage}')).toThrow('Invalid JSON')
    try { parseJsonDocument('{"token":"private-fixture" garbage}') } catch (error) { expect(String(error)).not.toContain('private-fixture') }
    expect(parseJsonDocument('{"a":{"id":1},"b":{"id":2},"text":"{\\\"id\\\":1}"}')).toHaveProperty('text')
  })
  it('refuses precision loss, excessive size and depth', () => {
    expect(() => parseJsonDocument('[9007199254740993]')).toThrow('Unsafe integer')
    expect(() => parseJsonDocument('[1e999]')).toThrow('non-finite')
    expect(() => parseJsonDocument(' '.repeat(MAX_ANALYSIS_CHARS + 1))).toThrow('2 Mi')
    expect(() => parseJsonDocument('['.repeat(65) + '0' + ']'.repeat(65))).toThrow('64 nesting')
    expect(parseJsonDocument('["9007199254740993"]')).toEqual(['9007199254740993'])
  })
  it('keeps pointer lookups own-only and preserves escaped paths', () => {
    expect(atPointer({ 'a/b': { '~': 4 } }, '/a~1b/~0')).toBe(4)
    expect(atPointer({}, '/constructor')).toBeUndefined()
    expect(() => atPointer({}, 'id')).toThrow('JSON Pointer')
    expect(() => atPointer({}, '/a~2')).toThrow('JSON Pointer')
    expect(canonical({ a: 1, b: 2 })).toBe(canonical({ b: 2, a: 1 }))
  })
  it('supports bounded YAML but refuses duplicate keys, circular aliases and non-JSON values', () => {
    expect(parseContract('openapi: 3.1.0\npaths: {}')).toHaveProperty('openapi', '3.1.0')
    expect(() => parseContract('a: 1\na: 2')).toThrow('YAML')
    expect(() => parseContract('a: &a\n  child: *a')).toThrow('Circular')
    expect(() => parseContract('a: .inf')).toThrow('non-finite')
  })
})

describe('JSON Schema payload validation', () => {
  it('validates the order example with local refs and field-level errors', () => {
    const result = validatePayload(SCHEMA_EXAMPLE, PAYLOAD_EXAMPLE, '2020-12')
    expect(result.valid).toBe(false)
    expect(result.errors.some(error => error.instancePath.includes('/items/0/quantity') && error.keyword === 'minimum')).toBe(true)
    expect(validatePayload(SCHEMA_EXAMPLE, PAYLOAD_EXAMPLE.replace('"quantity": 0', '"quantity": 1'), '2020-12').valid).toBe(true)
  })
  it('supports tuple items, composition, conditions and dependent fields', () => {
    expect(validate({ type: 'array', prefixItems: [{ type: 'integer' }, { type: 'string' }], items: false }, [1, 'x']).valid).toBe(true)
    expect(validate({ type: 'array', prefixItems: [{ type: 'integer' }], items: false }, [1, 2]).valid).toBe(false)
    expect(validate({ anyOf: [{ type: 'integer' }, { type: 'null' }] }, 'x').valid).toBe(false)
    expect(validate({ type: 'object', dependentRequired: { card: ['billing'] } }, { card: 'fixture' }).valid).toBe(false)
    expect(validate({ if: { required: ['paid'] }, then: { required: ['receipt'] } }, { paid: true }).valid).toBe(false)
  })
  it('supports draft 7 and boolean local schemas', () => {
    expect(validatePayload(json({ type: 'array', items: [{ type: 'integer' }], additionalItems: false }), '[1]', '7').valid).toBe(true)
    expect(validate(false, {}).valid).toBe(false)
    expect(validate({ $defs: { denied: false }, $ref: '#/$defs/denied' }, 'x').valid).toBe(false)
  })
  it('checks formats without coercing payloads', () => {
    expect(validate({ type: 'string', format: 'email' }, 'invalid').valid).toBe(false)
    expect(validate({ type: 'integer' }, '1').valid).toBe(false)
    expect(() => validate({ format: 'idn-email' }, 'fixture')).toThrow('unsupported')
    expect(() => validate({ properties: { field: { type: 'integer' } }, $ref: '#/properties' }, {})).toThrow('does not point to a schema')
  })
  it('does not satisfy required properties through Object.prototype names', () => {
    expect(validate({ required: ['constructor'] }, {}).valid).toBe(false)
    expect(validate({ required: ['toString'] }, {}).valid).toBe(false)
    expect(validate({ properties: { constructor: { type: 'integer' } } }, {}).valid).toBe(true)
    expect(validate({ required: ['constructor'], properties: { constructor: { type: 'integer' } } }, { constructor: 1 }).valid).toBe(true)
    expect(validate({ type: 'object', additionalProperties: false }, { toString: 'fixture' }).valid).toBe(false)
  })
  it.each([
    { $ref: 'https://example.test/schema' }, { $ref: '#/missing' }, { $dynamicRef: '#' },
    { type: 'object', properties: { child: { $id: 'https://example.test/child', type: 'string' } } },
    { type: 'made-up' }, { required: 'id' }, { pattern: '[' }, { minimum: '0' },
    { unknownConstraint: true }, { format: 'unknown' }, { $schema: 'https://example.test/meta' }
  ])('refuses unsupported or malformed schema constraints %j', schema => {
    expect(() => validate(schema, {})).toThrow()
  })
  it('omits const/enum and payload values from error reports', () => {
    const result = validate({ const: 'private-expected-fixture' }, 'private-actual-fixture')
    expect(result.valid).toBe(false)
    expect(json(result)).not.toContain('private-')
  })
  it('stops at the first invalid array item instead of allocating all diagnostics', () => {
    const result = validate({ type: 'array', items: { type: 'integer' } }, Array(300).fill('bad'))
    expect(result.valid).toBe(false)
    expect(result.errors.some(error => error.instancePath.endsWith('/0'))).toBe(true)
    expect(result.errors.some(error => error.instancePath.endsWith('/1'))).toBe(false)
    expect(result.errors.length).toBeLessThan(5); expect(result.truncated).toBe(false)
  })
})

describe('keyed data reconciliation', () => {
  it('reconciles the sample ignoring volatile metadata', () => {
    const result = reconcileData(RECONCILE_BASE_EXAMPLE, RECONCILE_TARGET_EXAMPLE, '/id', '/updatedAt')
    expect(result.counts).toEqual({ same: 1, changed: 1, missing: 1, extra: 0, duplicate: 2 })
    expect(result.rows.find(row => row.status === 'changed')?.fields).toEqual(['/balance'])
    expect(json(result)).not.toContain('sample-'); expect(json(result)).not.toContain('250')
  })
  it('joins by key independent of input order and distinguishes numeric/string IDs', () => {
    const result = reconcileData('[{"id":1,"a":1},{"id":"1","a":2}]', '[{"a":2,"id":"1"},{"a":1,"id":1}]', '/id')
    expect(result.counts.same).toBe(2); expect(result.rows[0].targetRow).toBe(2)
  })
  it('marks every row in a duplicate group ambiguous rather than silently matching', () => {
    expect(reconcileData('[{"id":"x"},{"id":"x"}]', '[{"id":"x"}]', '/id').counts.duplicate).toBe(3)
  })
  it('handles missing/null, escaped fields and order-sensitive arrays', () => {
    const result = reconcileData('[{"id":1,"a/b":null,"list":[1,2]}]', '[{"id":1,"list":[2,1]}]', '/id')
    expect(result.rows[0].fields).toEqual(['/a~1b', '/list'])
  })
  it('rejects missing keys, non-object rows and malformed pointers', () => {
    expect(() => reconcileData('[{"id":null}]', '[]', '/id')).toThrow('row 1')
    expect(() => reconcileData('[1]', '[]', '/id')).toThrow('object')
    expect(() => reconcileData('[]', '[]', 'id')).toThrow('Pointer')
    expect(() => reconcileData('[]', '[]', '/id', '/bad~2')).toThrow('Pointer')
  })
  it('caps rows but counts all findings', () => {
    const result = reconcileData(json(Array.from({ length: 1100 }, (_, id) => ({ id }))), '[]', '/id')
    expect(result.counts.missing).toBe(1100); expect(result.rows).toHaveLength(1000); expect(result.truncated).toBe(true)
  })
})

describe('OpenAPI release review', () => {
  it('finds removed operations and new required params in the sample', () => {
    const result = reviewContract(CONTRACT_BASE_EXAMPLE, CONTRACT_TARGET_EXAMPLE)
    expect(result.counts.breaking).toBe(2)
    expect(result.findings.some(finding => finding.rule === 'operation-removed')).toBe(true)
    expect(result.findings.some(finding => finding.rule === 'parameter-required')).toBe(true)
  })
  it('uses inherited security and respects operation-level anonymous overrides', () => {
    expect(reviewContract(api()).operations[0].secured).toBe(true)
    expect(reviewContract(api({ security: [] })).operations[0].secured).toBe(false)
    expect(reviewContract(api({ security: [{}] })).findings.some(finding => finding.rule === 'anonymous-access')).toBe(true)
  })
  it('flags required body, removed response and security changes', () => {
    const result = reviewContract(api({ responses: { '200': {}, '404': {} } }), api({ responses: { '200': {} }, security: [], requestBody: { required: true, content: {} } }))
    expect(result.findings.map(finding => finding.rule)).toEqual(expect.arrayContaining(['body-required', 'response-removed', 'security-change']))
  })
  it('compares referenced schema changes without echoing example or constraint values', () => {
    const make = (type: string) => api({ responses: { '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/Item' }, example: 'private-example' } } } } }, { components: { schemas: { Item: { type, enum: ['private-enum'] } } } })
    const result = reviewContract(make('string'), make('integer'))
    expect(result.findings.some(finding => finding.rule === 'response-contract')).toBe(true)
    expect(json(result)).not.toContain('private-')
  })
  it('ignores object property order and documentation-only changes', () => {
    expect(reviewContract(api(), api({ summary: 'new description' })).counts).toEqual({ breaking: 0, review: 0, info: 0 })
  })
  it('retains property names matching annotations and default response contracts', () => {
    const make = (type: string) => api({ responses: { default: { description: 'Fallback', content: { 'application/json': { schema: { type: 'object', properties: { description: { type }, default: { type } } } } } } } })
    const result = reviewContract(make('string'), make('integer'))
    expect(result.findings.some(finding => finding.rule === 'response-contract')).toBe(true)
    expect(result.operations[0].responses).toBe(1)
    expect(reviewContract(api({ security: [{ description: [] }] })).operations[0].secured).toBe(true)
  })
  it('accepts YAML and refuses external, missing and cyclic references', () => {
    expect(reviewContract('openapi: 3.0.3\ninfo:\n  title: Fixture\n  version: "1"\npaths: {}').operations).toEqual([])
    expect(() => reviewContract(api({ requestBody: { $ref: 'https://example.test/ref' } }))).toThrow('never fetched')
    expect(() => reviewContract(api({ requestBody: { $ref: '#/missing' } }))).toThrow('unresolved')
    expect(() => reviewContract(api({ requestBody: { $ref: '#/components/schemas/Loop' } }, { components: { schemas: { Loop: { $ref: '#/components/schemas/Loop' } } } }))).toThrow('recursive')
    expect(() => reviewContract(api({}, { openapi: '2.0' }))).toThrow('3.0.x')
  })
  it('refuses duplicate parameters and invalid security shape', () => {
    expect(() => reviewContract(api({ parameters: [{ name: 'x', in: 'query' }, { name: 'x', in: 'query' }] }))).toThrow('duplicate')
    expect(() => reviewContract(api({ security: [{ token: 'wrong' }] }))).toThrow('security')
  })
})

describe('structured incident logs', () => {
  it('summarizes the sample using nearest-rank percentiles and numeric Pino levels', () => {
    const result = analyzeLogs(LOG_EXAMPLE, DEFAULT_LOG_FIELDS, filters)
    expect(result.matched).toBe(4); expect(result.errors).toBe(1)
    expect(result.latency).toEqual({ samples: 4, p50: 40, p95: 1200, p99: 1200, max: 1200 })
    expect(result.levels.find(group => group.name === 'warn')?.count).toBe(1)
    expect(json(result)).not.toContain('Sample downstream')
  })
  it('filters exact trace/service and recomputes metrics for matching records', () => {
    const result = analyzeLogs(LOG_EXAMPLE, DEFAULT_LOG_FIELDS, { ...filters, trace: 'sample-trace-b', service: 'orders' })
    expect(result.matched).toBe(1); expect(result.latency.p50).toBe(1200)
  })
  it('supports nested mapping and inclusive explicit-timezone windows', () => {
    const result = analyzeLogs(json({ meta: { level: 'error', latency: 12, time: '2026-10-06T08:00:00+07:00' } }), { ...DEFAULT_LOG_FIELDS, level: '/meta/level', duration: '/meta/latency', timestamp: '/meta/time' }, { ...filters, from: '2026-10-06T01:00:00Z', to: '2026-10-06T01:00:00Z' })
    expect(result.matched).toBe(1); expect(result.errors).toBe(1)
    expect(() => analyzeLogs(LOG_EXAMPLE, DEFAULT_LOG_FIELDS, { ...filters, from: '2026-10-06T01:00:00' })).toThrow('explicit offset')
    expect(() => analyzeLogs(LOG_EXAMPLE, DEFAULT_LOG_FIELDS, { ...filters, from: '2026-02-30T01:00:00Z' })).toThrow('valid ISO')
  })
  it('reports malformed lines without echoing their content and excludes invalid latency', () => {
    const result = analyzeLogs('private-fixture\n[]\n{"level":"error","durationMs":-1}\n{"level":"info","durationMs":"100"}', DEFAULT_LOG_FIELDS, filters)
    expect(result.invalidLines).toEqual([1, 2]); expect(result.total).toBe(2); expect(result.latency.samples).toBe(0)
    expect(json(result)).not.toContain('private-fixture')
  })
  it('does not merge distinct long service identifiers', () => {
    const result = analyzeLogs([json({ service: 'x'.repeat(256) + 'a' }), json({ service: 'x'.repeat(256) + 'b' })].join('\n'), DEFAULT_LOG_FIELDS, filters)
    expect(result.services).toHaveLength(2)
  })
  it('bounds detail rows and counts all matches', () => {
    const result = analyzeLogs(Array(600).fill('{"level":"error"}').join('\n'), DEFAULT_LOG_FIELDS, filters)
    expect(result.matched).toBe(600); expect(result.rows).toHaveLength(500); expect(result.truncated).toBe(true)
  })
})
