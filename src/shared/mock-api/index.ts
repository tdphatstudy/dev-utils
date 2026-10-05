import YAML, { isAlias, isMap, isPair, isSeq } from 'yaml'
import {
  MOCK_CONDITION_OPERATORS, MOCK_CONDITION_SOURCES, MOCK_LIMITS, MOCK_METHODS,
  type JsonValue, type MockCondition, type MockConfig, type MockEndpoint,
  type MockMatch, type MockRequest, type MockResponse, type MockWhen
} from './types'

export * from './types'
export { MOCK_EXAMPLE_YAML } from './example'
export { parseMockTarget } from './target'

const unsafeKeys = new Set(['__proto__', 'prototype', 'constructor'])
const headerName = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/
const identifier = /^[a-zA-Z0-9_-]{1,64}$/
const paramName = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/
const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/
const forbiddenHeaders = new Set([
  'content-length', 'transfer-encoding', 'connection', 'set-cookie', 'set-cookie2',
  'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'trailer', 'te', 'upgrade',
  'host', 'content-encoding'
])
const utf8 = new TextEncoder()

function fail(path: string, message: string): never { throw new Error(`${path}: ${message}`) }
function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) fail(path, 'Expected a plain object.')
  return value as Record<string, unknown>
}
function fields(value: Record<string, unknown>, allowed: string[], path: string): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(path, `Unknown field "${key}".`)
}
function string(value: unknown, path: string, max = 120, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim()) || /[\u0000-\u001f\u007f]/.test(value)) fail(path, `Expected ${allowEmpty ? 'a' : 'a nonempty'} string up to ${max} characters without control characters.`)
  return value
}
function integer(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) fail(path, `Expected an integer from ${min} to ${max}.`)
  return value
}
function list(value: unknown, path: string, max: number, min = 1): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(path, `Expected ${min} to ${max} items.`)
  return value
}
function id(value: unknown, path: string): string {
  const result = string(value, path, 64)
  if (!identifier.test(result)) fail(path, 'Use letters, numbers, hyphens and underscores.')
  return result
}
function utf8Length(value: string): number { return utf8.encode(value).byteLength }
function yamlIssue(issue: { code: string; linePos?: { line: number; col: number }[] }): Error {
  const explanations: Record<string, string> = {
    DUPLICATE_KEY: 'Duplicate mapping key',
    MULTIPLE_DOCS: 'Use a single YAML document',
    TAG_RESOLVE_FAILED: 'Custom or unresolved YAML tags are not supported',
    BAD_INDENT: 'Check YAML indentation',
    MISSING_CHAR: 'A quote, bracket or other required character is missing'
  }
  const position = issue.linePos?.[0]
  const location = position ? ` at line ${position.line}, column ${position.col}` : ''
  // YAML diagnostics may contain source snippets or custom tag names. Report
  // location and a fixed description rather than reflecting configuration data.
  return new Error(`YAML${location}: ${explanations[issue.code] ?? 'Invalid YAML configuration'}.`)
}

/** Validate and copy a JSON value without getters, cycles, non-finite numbers or excessive nesting. */
export function validateMockJson(value: unknown, path = 'body'): JsonValue {
  const active = new Set<object>()
  let count = 0
  let textBytes = 0
  const countText = (text: string): void => {
    if (text.length > MOCK_LIMITS.responseBytes) fail(path, 'JSON exceeds 1 MiB.')
    textBytes += utf8Length(text)
    if (textBytes > MOCK_LIMITS.responseBytes) fail(path, 'JSON exceeds 1 MiB.')
  }
  function walk(input: unknown, depth: number): JsonValue {
    if (++count > MOCK_LIMITS.nodes || depth > MOCK_LIMITS.depth) fail(path, 'JSON exceeds the size or nesting limit.')
    if (typeof input === 'string') { countText(input); return input }
    if (input === null || typeof input === 'boolean') return input
    if (typeof input === 'number' && Number.isFinite(input)) return input
    if (!input || typeof input !== 'object') fail(path, 'Use only JSON objects, arrays, strings, booleans, null and finite numbers.')
    if (active.has(input)) fail(path, 'Circular values are not supported.')
    active.add(input)
    let result: JsonValue
    if (Array.isArray(input)) {
      if (Object.keys(input).length !== input.length) fail(path, 'Sparse arrays and extra array properties are not supported.')
      const output: JsonValue[] = []
      for (let i = 0; i < input.length; i++) {
        const descriptor = Object.getOwnPropertyDescriptor(input, String(i))
        if (!descriptor || !('value' in descriptor)) fail(path, 'Sparse arrays and accessors are not supported.')
        output.push(walk(descriptor.value, depth + 1))
      }
      result = output
    } else {
      const source = object(input, path)
      const output: Record<string, JsonValue> = Object.create(null)
      for (const key of Object.keys(source)) {
        countText(key)
        if (unsafeKeys.has(key)) fail(path, `Reserved key "${key}" is not supported.`)
        const descriptor = Object.getOwnPropertyDescriptor(source, key)
        if (!descriptor || !('value' in descriptor)) fail(path, 'Accessors are not supported.')
        output[key] = walk(descriptor.value, depth + 1)
      }
      result = output
    }
    active.delete(input)
    return result
  }
  const result = walk(value, 0)
  if (utf8Length(JSON.stringify(result)) > MOCK_LIMITS.responseBytes) fail(path, 'JSON exceeds 1 MiB.')
  return result
}

function pointerParts(key: string, path: string): string[] {
  if (key === '') return []
  if (!key.startsWith('/') || /~(?:[^01]|$)/.test(key)) fail(path, 'Body keys use JSON Pointer: /name, /filters/active, or an empty key for the root.')
  const parts = key.slice(1).split('/').map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'))
  if (parts.length > MOCK_LIMITS.depth || parts.some(part => unsafeKeys.has(part))) fail(path, 'Body pointer uses a reserved key or exceeds 20 levels.')
  return parts
}

function validateCondition(value: unknown, path: string, params: Set<string>): MockCondition {
  const item = object(value, path)
  fields(item, ['source', 'key', 'operator', 'value'], path)
  if (!MOCK_CONDITION_SOURCES.includes(item.source as MockCondition['source'])) fail(`${path}.source`, 'Choose header, query, path or body.')
  if (!MOCK_CONDITION_OPERATORS.includes(item.operator as MockCondition['operator'])) fail(`${path}.operator`, 'Unknown condition operator.')
  const source = item.source as MockCondition['source']
  const operator = item.operator as MockCondition['operator']
  const key = string(item.key, `${path}.key`, source === 'body' ? 512 : 128, source === 'body')
  if (source === 'header' && !headerName.test(key)) fail(`${path}.key`, 'Invalid HTTP header name.')
  if (source === 'path' && (!paramName.test(key) || !params.has(key))) fail(`${path}.key`, 'Use a parameter declared in the endpoint path.')
  if (source === 'body') pointerParts(key, `${path}.key`)
  if (operator === 'exists' || operator === 'missing') {
    if (Object.hasOwn(item, 'value')) fail(path, `${operator} does not use a value.`)
    return { source, key, operator }
  }
  if (!Object.hasOwn(item, 'value') || (item.value !== null && !['string', 'number', 'boolean'].includes(typeof item.value))) fail(`${path}.value`, 'Provide a string, finite number, boolean or null.')
  const expected = item.value as MockCondition['value']
  if (typeof expected === 'number' && !Number.isFinite(expected)) fail(`${path}.value`, 'Numbers must be finite.')
  if (typeof expected === 'string' && expected.length > 4096) fail(`${path}.value`, 'Condition values are limited to 4096 characters.')
  if (operator === 'contains' && typeof expected !== 'string') fail(`${path}.value`, 'contains requires a string.')
  if (['gt', 'gte', 'lt', 'lte'].includes(operator) && typeof expected !== 'number') fail(`${path}.value`, 'Numeric comparisons require a number.')
  return { source, key, operator, value: expected }
}

function validateWhen(value: unknown, path: string, params: Set<string>): MockWhen {
  const item = object(value, path)
  fields(item, ['all', 'any'], path)
  const result: MockWhen = {}
  let count = 0
  for (const kind of ['all', 'any'] as const) if (Object.hasOwn(item, kind)) {
    result[kind] = list(item[kind], `${path}.${kind}`, MOCK_LIMITS.conditions).map((condition, i) => validateCondition(condition, `${path}.${kind}[${i}]`, params))
    count += result[kind]!.length
  }
  if (!count || count > MOCK_LIMITS.conditions) fail(path, 'Use 1 to 20 conditions in total. An omitted when marks the final fallback.')
  return result
}

function validateHeaders(value: unknown, path: string): Record<string, string> {
  const item = object(value, path)
  if (Object.keys(item).length > MOCK_LIMITS.headers) fail(path, 'Use at most 50 response headers.')
  const output: Record<string, string> = Object.create(null)
  const seen = new Set<string>()
  let bytes = 0
  for (const [key, val] of Object.entries(item)) {
    const lower = key.toLowerCase()
    if (!headerName.test(key) || key.length > 128 || seen.has(lower)) fail(path, 'Header names must be valid and unique, ignoring case.')
    if (forbiddenHeaders.has(lower) || lower.startsWith('access-control-')) fail(path, `Header "${key}" is managed by the server and cannot be overridden.`)
    if (typeof val !== 'string' || val.length > 4096 || /[^\t\x20-\x7e\x80-\xff]/.test(val)) fail(path, 'Header values must be HTTP-safe strings up to 4096 characters without newlines.')
    bytes += key.length + val.length
    if (bytes > 16 * 1024) fail(path, 'Response headers exceed 16 KiB.')
    seen.add(lower)
    output[key] = val
  }
  return output
}

function validateResponse(value: unknown, path: string, params: Set<string>): MockResponse {
  const item = object(value, path)
  fields(item, ['id', 'name', 'when', 'status', 'headers', 'body', 'bodyType', 'delayMs'], path)
  const result: MockResponse = { id: id(item.id, `${path}.id`), name: string(item.name, `${path}.name`), status: integer(item.status, `${path}.status`, 200, 599) }
  if (Object.hasOwn(item, 'when')) result.when = validateWhen(item.when, `${path}.when`, params)
  if (Object.hasOwn(item, 'headers')) result.headers = validateHeaders(item.headers, `${path}.headers`)
  if (Object.hasOwn(item, 'bodyType')) {
    if (item.bodyType !== 'json' && item.bodyType !== 'text') fail(`${path}.bodyType`, 'Choose json or text.')
    result.bodyType = item.bodyType
  }
  if (Object.hasOwn(item, 'body')) {
    if (result.bodyType === 'text') {
      if (typeof item.body !== 'string' || utf8Length(item.body) > MOCK_LIMITS.responseBytes) fail(`${path}.body`, 'Text responses require a string up to 1 MiB.')
      result.body = item.body
    } else result.body = validateMockJson(item.body, `${path}.body`)
  }
  if (Object.hasOwn(item, 'delayMs')) result.delayMs = integer(item.delayMs, `${path}.delayMs`, 0, MOCK_LIMITS.delayMs)
  return result
}

function validatePath(value: unknown, path: string): { value: string; params: Set<string>; shape: string } {
  const result = string(value, path, 1024)
  if (!result.startsWith('/') || /[?#\\\s]/.test(result) || result.includes('//')) fail(path, 'Use an absolute path without query, fragment, whitespace, backslashes or empty segments; for example /api/users/:id.')
  const params = new Set<string>()
  const parts = result.split('/').map((part, i) => {
    if (part.startsWith(':')) {
      const key = part.slice(1)
      if (!paramName.test(key) || unsafeKeys.has(key) || params.has(key)) fail(path, 'Path parameters need unique safe names, for example :id.')
      params.add(key)
      return ':'
    }
    if (i === 0 || part === '' && i === result.split('/').length - 1) return part
    let decoded: string
    try { decoded = decodeURIComponent(part) } catch { fail(path, 'Path has invalid percent encoding.') }
    if (decoded === '.' || decoded === '..' || /[/:\u0000-\u0020\u007f\\]/.test(decoded)) fail(path, 'Static segments cannot contain slashes, colons, control characters, or dot traversal.')
    return decoded
  })
  return { value: result, params, shape: parts.join('/') }
}

function validateOrigin(value: unknown, path: string): string {
  const result = string(value, path, 512)
  if (result === 'http://localhost:*' || result === 'http://127.0.0.1:*') return result
  let parsed: URL
  try { parsed = new URL(result) } catch { fail(path, 'Use an exact http/https origin, or http://localhost:* / http://127.0.0.1:*.') }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.origin !== result || parsed.hostname.includes('*')) fail(path, 'Use only an exact http/https origin without a path, credentials, wildcard, query or fragment.')
  return result
}

/** Runtime IPC boundary validation. Returns a detached, normalized safe snapshot. */
export function validateMockConfig(value: unknown): MockConfig {
  // Check global depth/node/serialized size before processing many per-endpoint bodies.
  const input = validateMockJson(value, 'config')
  const item = object(input, 'config')
  fields(item, ['version', 'name', 'port', 'cors', 'endpoints'], 'config')
  if (item.version !== 1) fail('config.version', 'Only version 1 is supported.')
  const cors = object(item.cors, 'config.cors')
  fields(cors, ['enabled', 'origins'], 'config.cors')
  if (typeof cors.enabled !== 'boolean') fail('config.cors.enabled', 'Expected true or false.')
  const origins = list(cors.origins, 'config.cors.origins', 50, 0).map((origin, i) => validateOrigin(origin, `config.cors.origins[${i}]`))
  if (new Set(origins).size !== origins.length) fail('config.cors.origins', 'Origins must be unique.')
  if (cors.enabled && !origins.length) fail('config.cors.origins', 'Add at least one allowed origin when CORS is enabled.')
  const endpointIds = new Set<string>()
  const shapes = new Set<string>()
  const endpoints = list(item.endpoints, 'config.endpoints', MOCK_LIMITS.endpoints).map((value, i): MockEndpoint => {
    const path = `config.endpoints[${i}]`
    const entry = object(value, path)
    fields(entry, ['id', 'name', 'method', 'path', 'responses'], path)
    const endpointId = id(entry.id, `${path}.id`)
    if (endpointIds.has(endpointId)) fail(`${path}.id`, 'Endpoint IDs must be unique.')
    endpointIds.add(endpointId)
    if (!MOCK_METHODS.includes(entry.method as MockEndpoint['method'])) fail(`${path}.method`, 'Use GET, POST, PUT, PATCH, DELETE, HEAD or OPTIONS.')
    const route = validatePath(entry.path, `${path}.path`)
    const shape = `${entry.method} ${route.shape}`
    if (shapes.has(shape)) fail(`${path}.path`, 'Duplicate method/path shape. Renaming a path parameter does not create a different route.')
    shapes.add(shape)
    const responseIds = new Set<string>()
    const responses = list(entry.responses, `${path}.responses`, MOCK_LIMITS.responses).map((response, j) => {
      const result = validateResponse(response, `${path}.responses[${j}]`, route.params)
      if (responseIds.has(result.id)) fail(`${path}.responses[${j}].id`, 'Response IDs must be unique within an endpoint.')
      responseIds.add(result.id)
      return result
    })
    for (let j = 0; j < responses.length; j++) {
      if (j === responses.length - 1 && responses[j].when) fail(`${path}.responses[${j}]`, 'The last response must be an unconditional fallback: omit when.')
      if (j < responses.length - 1 && !responses[j].when) fail(`${path}.responses[${j}]`, 'Only the final response can be unconditional. Add conditions or move it last.')
    }
    return { id: endpointId, name: string(entry.name, `${path}.name`), method: entry.method as MockEndpoint['method'], path: route.value, responses }
  })
  return { version: 1, name: string(item.name, 'config.name'), port: integer(item.port, 'config.port', 1024, 65535), cors: { enabled: cors.enabled, origins }, endpoints }
}

/** YAML aliases and custom tags are refused before conversion to avoid expansion and type surprises. */
export function parseMockConfig(text: string): MockConfig {
  if (typeof text !== 'string' || text.length > MOCK_LIMITS.yamlBytes || utf8Length(text) > MOCK_LIMITS.yamlBytes) fail('YAML', 'Configuration must be a string up to 1 MiB of UTF-8.')
  const doc = YAML.parseDocument(text, { uniqueKeys: true, strict: true, schema: 'core', version: '1.2', stringKeys: true })
  if (doc.errors.length) throw yamlIssue(doc.errors[0])
  if (doc.warnings.length) throw yamlIssue(doc.warnings[0])
  const stack: { node: unknown; depth: number }[] = [{ node: doc.contents, depth: 0 }]
  let count = 0
  while (stack.length) {
    const { node, depth } = stack.pop()!
    if (++count > MOCK_LIMITS.nodes || depth > MOCK_LIMITS.depth * 2 + 4) fail('YAML', 'Configuration exceeds the node or nesting limit.')
    if (isAlias(node)) fail('YAML', 'Aliases are not supported. Repeat the small value explicitly.')
    if (isPair(node)) { stack.push({ node: node.key, depth: depth + 1 }, { node: node.value, depth: depth + 1 }) }
    else if (isMap(node) || isSeq(node)) for (const child of node.items) stack.push({ node: child, depth: depth + 1 })
  }
  return validateMockConfig(doc.toJS({ maxAliasCount: 0 }))
}

export function serializeMockConfig(config: MockConfig): string {
  const text = YAML.stringify(validateMockConfig(config), { indent: 2, lineWidth: 0, aliasDuplicateObjects: false })
  if (utf8Length(text) > MOCK_LIMITS.yamlBytes) fail('YAML', 'Export exceeds 1 MiB. Reduce the configuration.')
  return text
}

function requestParams(template: string, path: string): Record<string, string> | null {
  if (!path.startsWith('/') || path.length > 4096 || /[?#\\\u0000-\u001f\u007f]/.test(path)) return null
  const expected = template.split('/')
  const actual = path.split('/')
  if (expected.length !== actual.length) return null
  const params: Record<string, string> = Object.create(null)
  for (let i = 0; i < expected.length; i++) {
    let part: string, literal: string
    try { part = decodeURIComponent(actual[i]); literal = decodeURIComponent(expected[i]) } catch { return null }
    if (/[\/\\\u0000-\u001f\u007f]/.test(part) || part === '.' || part === '..') return null
    if (expected[i].startsWith(':')) {
      if (!part) return null
      params[expected[i].slice(1)] = part
    } else if (literal !== part) return null
  }
  return params
}

function bodyValue(body: JsonValue | undefined, key: string): unknown {
  let value: unknown = body
  const parts = key === '' ? [] : key.slice(1).split('/').map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'))
  for (const part of parts) {
    if (unsafeKeys.has(part) || !value || typeof value !== 'object' || !Object.hasOwn(value, part)) return undefined
    if (Array.isArray(value) && !/^(0|[1-9]\d*)$/.test(part)) return undefined
    value = (value as Record<string, unknown>)[part]
  }
  return value
}

function conditionValues(condition: MockCondition, request: MockRequest, params: Record<string, string>): unknown[] {
  if (condition.source === 'body') {
    const value = bodyValue(request.body, condition.key)
    return value === undefined ? [] : [value]
  }
  if (condition.source === 'path') return Object.hasOwn(params, condition.key) ? [params[condition.key]] : []
  if (condition.source === 'query') return Object.hasOwn(request.query, condition.key) ? request.query[condition.key] : []
  const values: string[] = []
  for (const [key, value] of Object.entries(request.headers)) if (key.toLowerCase() === condition.key.toLowerCase()) values.push(...(Array.isArray(value) ? value : [value]))
  return values
}

function compares(actual: unknown, condition: MockCondition): boolean {
  if (actual !== null && typeof actual === 'object') return false
  const expected = condition.source === 'body' ? condition.value : String(condition.value)
  switch (condition.operator) {
    case 'equals': return actual === expected
    case 'notEquals': return actual !== expected
    case 'contains': return typeof actual === 'string' && actual.includes(condition.value as string)
    case 'gt': case 'gte': case 'lt': case 'lte': {
      const number = typeof actual === 'number' ? actual : typeof actual === 'string' && numeric.test(actual) ? Number(actual) : NaN
      if (!Number.isFinite(number)) return false
      const expectedNumber = condition.value as number
      if (condition.operator === 'gt') return number > expectedNumber
      if (condition.operator === 'gte') return number >= expectedNumber
      if (condition.operator === 'lt') return number < expectedNumber
      return number <= expectedNumber
    }
    default: return false
  }
}

/** Repeated header/query values match ANY value. Missing means no values, including for notEquals. */
export function matchesMockCondition(condition: MockCondition, request: MockRequest, params: Record<string, string>): boolean {
  const values = conditionValues(condition, request, params)
  if (condition.operator === 'exists') return values.length > 0
  if (condition.operator === 'missing') return values.length === 0
  return values.some(value => compares(value, condition))
}

/** Routes are checked in configured order; within a route the first matching response wins. */
export function matchMockRequest(config: MockConfig, request: MockRequest): MockMatch | null {
  const method = request.method.toUpperCase()
  for (const endpoint of config.endpoints) {
    if (endpoint.method !== method) continue
    const params = requestParams(endpoint.path, request.path)
    if (!params) continue
    for (const response of endpoint.responses) {
      const when = response.when
      if (!when || ((!when.all || when.all.every(condition => matchesMockCondition(condition, request, params))) &&
        (!when.any || when.any.some(condition => matchesMockCondition(condition, request, params))))) return { endpoint, response, params }
    }
    return null
  }
  return null
}

export function matchesCorsOrigin(config: MockConfig, origin: string): boolean {
  if (!config.cors.enabled || typeof origin !== 'string' || origin.length > 512) return false
  let parsed: URL
  try { parsed = new URL(origin) } catch { return false }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.origin !== origin) return false
  return config.cors.origins.some(allowed => allowed === origin ||
    allowed === 'http://localhost:*' && parsed.protocol === 'http:' && parsed.hostname === 'localhost' ||
    allowed === 'http://127.0.0.1:*' && parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1')
}
