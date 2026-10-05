import { describe, expect, it } from 'vitest'
import {
  MOCK_EXAMPLE_YAML, MOCK_LIMITS, matchMockRequest, matchesCorsOrigin,
  matchesMockCondition, parseMockConfig, serializeMockConfig, validateMockConfig,
  validateMockJson, type MockCondition, type MockConfig, type MockRequest
} from './index'

function example(): MockConfig { return parseMockConfig(MOCK_EXAMPLE_YAML) }
function request(overrides: Partial<MockRequest> = {}): MockRequest {
  return { method: 'GET', path: '/api/users', headers: { Authorization: 'Bearer example' }, query: {}, ...overrides }
}
function change(update: (config: MockConfig) => void): () => MockConfig {
  return () => { const config = example(); update(config); return validateMockConfig(config) }
}

describe('Mock API configuration', () => {
  it('round-trips the complete sample through YAML without changing response precedence or types', () => {
    const config = example()
    expect(config.endpoints).toHaveLength(2)
    expect(parseMockConfig(serializeMockConfig(config))).toEqual(config)
    expect(config.endpoints[0].responses[2].when!.all![0].value).toBe(3)
  })

  it.each([
    ['duplicate keys', `${MOCK_EXAMPLE_YAML}\nport: 4011`],
    ['aliases', MOCK_EXAMPLE_YAML.replace('name: Frontend user API', 'name: &name Frontend user API').replace('name: List users', 'name: *name')],
    ['cyclic aliases', 'version: 1\nname: &name [*name]'],
    ['custom tags', MOCK_EXAMPLE_YAML.replace('name: Frontend user API', 'name: !not-json Frontend user API')],
    ['multiple documents', `${MOCK_EXAMPLE_YAML}\n---\nversion: 1`],
    ['input over byte limit', '#'.repeat(MOCK_LIMITS.yamlBytes + 1)],
    ['UTF-8 input over byte limit', '# ' + 'é'.repeat(MOCK_LIMITS.yamlBytes / 2)],
    ['unknown top-level fields', `${MOCK_EXAMPLE_YAML}\nproxy: https://example.com`]
  ])('rejects %s', (_name, yaml) => { expect(() => parseMockConfig(yaml)).toThrow() })

  it.each([
    ['version', (c: MockConfig) => { (c as { version: number }).version = 2 }],
    ['port below allowed range', (c: MockConfig) => { c.port = 80 }],
    ['fractional port', (c: MockConfig) => { c.port = 4010.5 }],
    ['port above allowed range', (c: MockConfig) => { c.port = 65536 }],
    ['empty name', (c: MockConfig) => { c.name = '' }],
    ['name with control characters', (c: MockConfig) => { c.name = 'project\nsecret' }],
    ['empty endpoints', (c: MockConfig) => { c.endpoints = [] }],
    ['too many endpoints', (c: MockConfig) => { c.endpoints = Array.from({ length: 101 }, (_, i) => ({ ...c.endpoints[0], id: `id-${i}`, path: `/route-${i}` })) }],
    ['duplicate endpoint ID', (c: MockConfig) => { c.endpoints[1].id = c.endpoints[0].id }],
    ['duplicate method and path', (c: MockConfig) => { c.endpoints[1].method = 'GET' }],
    ['duplicate parameter shape', (c: MockConfig) => { c.endpoints[0].path = '/users/:id'; c.endpoints[1].path = '/users/:name'; c.endpoints[1].method = 'GET' }],
    ['empty responses', (c: MockConfig) => { c.endpoints[0].responses = [] }],
    ['too many responses', (c: MockConfig) => { c.endpoints[0].responses = Array.from({ length: 21 }, (_, i) => ({ ...c.endpoints[0].responses[0], id: `rule-${i}` })) }],
    ['duplicate response IDs', (c: MockConfig) => { c.endpoints[0].responses[1].id = c.endpoints[0].responses[0].id }],
    ['early unconditional response', (c: MockConfig) => { delete c.endpoints[0].responses[0].when }],
    ['conditional final response', (c: MockConfig) => { c.endpoints[0].responses[3].when = c.endpoints[0].responses[0].when }],
    ['empty condition object', (c: MockConfig) => { c.endpoints[0].responses[0].when = {} }],
    ['empty all conditions', (c: MockConfig) => { c.endpoints[0].responses[0].when = { all: [] } }],
    ['too many conditions total', (c: MockConfig) => { const condition = c.endpoints[0].responses[0].when!.all![0]; c.endpoints[0].responses[0].when = { all: Array(11).fill(condition), any: Array(10).fill(condition) } }],
    ['unknown response fields', (c: MockConfig) => { Object.assign(c.endpoints[0].responses[0], { script: 'return 1' }) }],
    ['unknown endpoint fields', (c: MockConfig) => { Object.assign(c.endpoints[0], { proxy: 'http://example.com' }) }],
    ['unknown condition fields', (c: MockConfig) => { Object.assign(c.endpoints[0].responses[0].when!.all![0], { regex: '.*' }) }],
    ['unknown when fields', (c: MockConfig) => { Object.assign(c.endpoints[0].responses[0].when!, { other: [] }) }],
    ['unknown CORS fields', (c: MockConfig) => { Object.assign(c.cors, { credentials: true }) }],
    ['status below supported range', (c: MockConfig) => { c.endpoints[0].responses[0].status = 101 }],
    ['status above supported range', (c: MockConfig) => { c.endpoints[0].responses[0].status = 600 }],
    ['negative delay', (c: MockConfig) => { c.endpoints[0].responses[0].delayMs = -1 }],
    ['excessive delay', (c: MockConfig) => { c.endpoints[0].responses[0].delayMs = 10001 }],
    ['fractional delay', (c: MockConfig) => { c.endpoints[0].responses[0].delayMs = 0.5 }],
    ['non-string text response', (c: MockConfig) => { c.endpoints[0].responses[0].bodyType = 'text' }],
    ['non-finite JSON', (c: MockConfig) => { c.endpoints[0].responses[0].body = { bad: Infinity } }],
    ['too large JSON', (c: MockConfig) => { c.endpoints[0].responses[0].body = 'é'.repeat(MOCK_LIMITS.responseBytes) }]
  ])('rejects %s at the runtime boundary', (_name, update) => { expect(change(update)).toThrow() })

  it('returns an independent snapshot, including nested conditions, headers and response body', () => {
    const original = example()
    const safe = validateMockConfig(original)
    original.endpoints[0].responses[1].headers!['X-Mock-Rule'] = 'changed'
    original.endpoints[0].responses[1].when!.all![0].value = 'changed'
    original.endpoints[0].responses[1].body = 'changed'
    expect(safe.endpoints[0].responses[1].headers!['X-Mock-Rule']).toBe('admins')
    expect(safe.endpoints[0].responses[1].when!.all![0].value).toBe('admin')
    expect(safe.endpoints[0].responses[1].body).not.toBe('changed')
  })

  it('does not include sensitive values in validation errors', () => {
    const yaml = MOCK_EXAMPLE_YAML.replace('value: admin', 'value: [SECRET_AUTH_VALUE]')
    expect(() => parseMockConfig(yaml)).toThrow('config.endpoints[0].responses[1].when.all[0].value')
    try { parseMockConfig(yaml) } catch (error) { expect(String(error)).not.toContain('SECRET_AUTH_VALUE') }
    const config = example()
    config.endpoints[0].responses[0].headers = { 'X-Key': 'SECRET_AUTH_VALUE\r\nInjected: value' }
    try { validateMockConfig(config) } catch (error) { expect(String(error)).not.toContain('SECRET_AUTH_VALUE') }
    for (const invalidYaml of ['name: !SECRET_AUTH_VALUE secret', 'name: [SECRET_AUTH_VALUE']) {
      try { parseMockConfig(invalidYaml) } catch (error) { expect(String(error)).not.toContain('SECRET_AUTH_VALUE') }
    }
  })
})

describe('Mock response headers', () => {
  it.each(['Content-Length', 'Transfer-Encoding', 'Connection', 'Keep-Alive', 'Set-Cookie', 'Set-Cookie2', 'Host', 'Trailer', 'TE', 'Upgrade', 'Content-Encoding', 'Proxy-Authenticate', 'Proxy-Authorization', 'Access-Control-Allow-Origin', 'ACCESS-CONTROL-ALLOW-CREDENTIALS'])('refuses managed %s', header => {
    expect(change(c => { c.endpoints[0].responses[0].headers = { [header]: 'anything' } })).toThrow()
  })
  it.each([
    ['invalid token', { 'Bad Header': 'value' }],
    ['CRLF', { 'X-Value': 'one\r\nX-Evil: two' }],
    ['non-HTTP unicode', { 'X-Value': 'tiếng Việt' }],
    ['non-string value', { 'X-Value': 42 }],
    ['duplicates ignoring case', { 'X-Key': 'one', 'x-key': 'two' }],
    ['too many headers', Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`X-Key-${i}`, 'ok']))],
    ['too long header value', { 'X-Key': 'x'.repeat(4097) }],
    ['too large headers total', Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`X-Key-${i}`, 'x'.repeat(4096)]))]
  ])('refuses %s', (_name, headers) => {
    expect(change(c => { c.endpoints[0].responses[0].headers = headers as Record<string, string> })).toThrow()
  })
  it('accepts custom headers, content type and Latin-1', () => {
    const config = change(c => { c.endpoints[0].responses[0].headers = { 'Content-Type': 'application/problem+json', 'X-Value': 'café' } })()
    expect(config.endpoints[0].responses[0].headers!['X-Value']).toBe('café')
  })
})

describe('Mock JSON and body pointers', () => {
  it('refuses cycles, accessors, sparse arrays, reserved keys and overdeep JSON', () => {
    const cycle: Record<string, unknown> = {}; cycle.self = cycle
    const accessor = Object.defineProperty({}, 'secret', { enumerable: true, get: () => { throw new Error('Accessor ran') } })
    const arrayAccessor = Object.defineProperty([], '0', { enumerable: true, get: () => { throw new Error('Accessor ran') } })
    let deep: unknown = {}; for (let i = 0; i < 21; i++) deep = { next: deep }
    for (const value of [cycle, accessor, arrayAccessor, Array(2), JSON.parse('{"__proto__":{"polluted":true}}'), deep, new Date(), undefined, NaN]) expect(() => validateMockJson(value)).toThrow()
    expect({}).not.toHaveProperty('polluted')
  })
  it.each(['/__proto__/polluted', '/constructor/name', '/prototype/name', 'name', '/bad~escape', '/bad~'])('refuses unsafe or invalid body pointer %s', key => {
    expect(change(c => { c.endpoints[1].responses[0].when!.all![0].key = key })).toThrow()
  })
  it('distinguishes null, false, empty string and a missing value', () => {
    const exists: MockCondition = { source: 'body', key: '/name', operator: 'exists' }
    const missing = { ...exists, operator: 'missing' } as MockCondition
    for (const name of [null, false, '', 0]) {
      expect(matchesMockCondition(exists, request({ body: { name } }), {})).toBe(true)
      expect(matchesMockCondition(missing, request({ body: { name } }), {})).toBe(false)
    }
    expect(matchesMockCondition(missing, request({ body: {} }), {})).toBe(true)
    expect(matchesMockCondition(missing, request(), {})).toBe(true)
  })
  it('uses typed primitive body equality and RFC6901 escaping, including array indices', () => {
    const req = request({ body: { active: true, count: 1, 'a/b': { '~name': ['yes'] }, items: [{ name: 'Alex' }] } })
    expect(matchesMockCondition({ source: 'body', key: '/active', operator: 'equals', value: true }, req, {})).toBe(true)
    expect(matchesMockCondition({ source: 'body', key: '/active', operator: 'equals', value: 'true' }, req, {})).toBe(false)
    expect(matchesMockCondition({ source: 'body', key: '/count', operator: 'equals', value: '1' }, req, {})).toBe(false)
    expect(matchesMockCondition({ source: 'body', key: '/a~1b/~0name/0', operator: 'equals', value: 'yes' }, req, {})).toBe(true)
    expect(matchesMockCondition({ source: 'body', key: '/items/0/name', operator: 'contains', value: 'Al' }, req, {})).toBe(true)
    expect(matchesMockCondition({ source: 'body', key: '/items/00/name', operator: 'missing' }, req, {})).toBe(true)
    expect(matchesMockCondition({ source: 'body', key: '/items', operator: 'notEquals', value: 'anything' }, req, {})).toBe(false)
    expect(matchesMockCondition({ source: 'body', key: '', operator: 'equals', value: null }, request({ body: null }), {})).toBe(true)
  })
})

describe('Mock response rule selection', () => {
  it('runs the sample rules in order, including authorization, filters, pagination and POST body validation', () => {
    const config = example()
    expect(matchMockRequest(config, request({ headers: {}, query: { role: ['admin'] } }))?.response.status).toBe(401)
    expect(matchMockRequest(config, request({ query: { role: ['admin'], page: ['4'] } }))?.response.id).toBe('admins')
    expect(matchMockRequest(config, request({ query: { page: ['4'] } }))?.response.id).toBe('empty-page')
    expect(matchMockRequest(config, request())?.response.id).toBe('list-default')
    expect(matchMockRequest(config, request({ method: 'POST', body: {} }))?.response.status).toBe(422)
    expect(matchMockRequest(config, request({ method: 'POST', body: { name: 'Alex' } }))?.response.status).toBe(201)
    expect(matchMockRequest(config, request({ method: 'PUT' }))).toBeNull()
    expect(matchMockRequest(config, request({ path: '/unknown' }))).toBeNull()
  })
  it('combines all AND at least one any condition; first matching response wins', () => {
    const config = example()
    config.endpoints[0].responses[1].when = {
      all: [{ source: 'query', key: 'active', operator: 'equals', value: true }],
      any: [{ source: 'query', key: 'role', operator: 'equals', value: 'admin' }, { source: 'query', key: 'team', operator: 'equals', value: 'core' }]
    }
    expect(matchMockRequest(validateMockConfig(config), request({ query: { active: ['true'], team: ['core'] } }))?.response.id).toBe('admins')
    expect(matchMockRequest(config, request({ query: { active: ['false'], team: ['core'] } }))?.response.id).toBe('list-default')
    expect(matchMockRequest(config, request({ query: { active: ['true'], team: ['other'] } }))?.response.id).toBe('list-default')
  })
  it('compares header names ignoring case and repeated query values using ANY semantics', () => {
    expect(matchMockRequest(example(), request({ headers: { aUtHoRiZaTiOn: '' }, query: { role: ['user', 'admin'] } }))?.response.id).toBe('admins')
    const neq: MockCondition = { source: 'query', key: 'role', operator: 'notEquals', value: 'admin' }
    expect(matchesMockCondition(neq, request({ query: { role: ['user', 'admin'] } }), {})).toBe(true)
    expect(matchesMockCondition(neq, request({ query: {} }), {})).toBe(false)
    expect(matchesMockCondition({ source: 'header', key: 'X-Team', operator: 'equals', value: 'core' }, request({ headers: { 'x-team': ['other', 'core'] } }), {})).toBe(true)
  })
  it.each(['', ' ', '0x10', 'Infinity', 'NaN', '4things', '1,000'])('never treats %j as a number', value => {
    expect(matchesMockCondition({ source: 'query', key: 'page', operator: 'gt', value: 0 }, request({ query: { page: [value] } }), {})).toBe(false)
  })
  it.each([
    ['gt', '4', 3, true], ['gte', '3', 3, true], ['lt', '2.5', 3, true], ['lte', '3', 3, true],
    ['gt', '3', 3, false], ['gte', '2.9', 3, false], ['lt', '3', 3, false], ['lte', '3.1', 3, false],
    ['gt', '1e2', 3, true], ['gt', '1e999', 3, false]
  ] as const)('numeric %s %s versus %d = %s', (operator, actual, value, expected) => {
    expect(matchesMockCondition({ source: 'query', key: 'page', operator, value }, request({ query: { page: [actual] } }), {})).toBe(expected)
  })
  it.each([
    { source: 'query', key: 'page', operator: 'gt', value: '3' },
    { source: 'body', key: '/name', operator: 'contains', value: 3 },
    { source: 'header', key: 'Authorization', operator: 'missing', value: 'secret' },
    { source: 'body', key: '/name', operator: 'equals' },
    { source: 'header', key: 'Bad Header', operator: 'exists' },
    { source: 'path', key: 'notDeclared', operator: 'exists' }
  ])('validates operator/source/value shape: %j', condition => {
    expect(change(c => { c.endpoints[0].responses[0].when = { all: [condition as MockCondition] } })).toThrow()
  })
})

describe('Mock paths', () => {
  function paramsConfig(): MockConfig {
    const config = example()
    config.endpoints[0].path = '/api/users/:id'
    config.endpoints[0].responses = [{ id: 'path-condition', name: 'Admin ID', when: { all: [{ source: 'path', key: 'id', operator: 'equals', value: 'admin' }] }, status: 200 }, { id: 'default', name: 'Fallback', status: 404 }]
    return validateMockConfig(config)
  }
  it('extracts safe decoded parameters and compares them in conditions', () => {
    const match = matchMockRequest(paramsConfig(), request({ path: '/api/users/%61dmin' }))
    expect(match?.params.id).toBe('admin')
    expect(match?.response.id).toBe('path-condition')
    expect(matchMockRequest(paramsConfig(), request({ path: '/api/users/%C3%A9' }))?.params.id).toBe('é')
    expect(matchMockRequest(paramsConfig(), request({ path: '/api/users/42' }))?.response.status).toBe(404)
  })
  it.each(['/api/users/', '/api/users/x/more', '/api/users/%ZZ', '/api/users/%2Fadmin', '/api/users/%5Cadmin', '/api/users/%00', '/api/users/..', '/api/users/%2e', '/api/users/a?b=1', '/api/users/a#hash'])('does not match malformed or ambiguous path %s', path => {
    expect(matchMockRequest(paramsConfig(), request({ path }))).toBeNull()
  })
  it.each(['users', '/users?x=1', '/users#x', '/users//a', '/users/../a', '/users/%2e%2e/a', '/users/%2f/a', '/users/:id/:id', '/users/:__proto__', '/users/:9id', '/users/white space', '/users\\id', '/users/%zz'])('refuses invalid route %s', path => {
    expect(change(c => { c.endpoints[0].path = path })).toThrow()
  })
  it('treats trailing slashes as distinct and follows configured order for overlapping routes', () => {
    const config = paramsConfig()
    config.endpoints.unshift({ id: 'static', name: 'Static route', method: 'GET', path: '/api/users/admin', responses: [{ id: 'ok', name: 'Static fallback', status: 202 }] })
    expect(matchMockRequest(validateMockConfig(config), request({ path: '/api/users/admin' }))?.response.status).toBe(202)
    config.endpoints[0].path += '/'
    expect(matchMockRequest(validateMockConfig(config), request({ path: '/api/users/admin' }))?.response.status).toBe(200)
    expect(matchMockRequest(config, request({ path: '/api/users/admin/' }))?.response.status).toBe(202)
  })
})

describe('Mock CORS origins', () => {
  it.each(['http://localhost:5173', 'http://127.0.0.1:3000', 'http://localhost', 'http://127.0.0.1'])('allows local origin %s by the explicit local wildcard', origin => {
    expect(matchesCorsOrigin(example(), origin)).toBe(true)
  })
  it.each(['null', '*', 'http://localhost.evil:5173', 'http://127.0.0.1.evil:3000', 'http://evil.localhost:3000', 'http://localhost:5173/path', 'http://localhost:5173/', 'http://user@localhost:5173', 'file://localhost', 'https://localhost:5173', 'http://127.1:3000', 'http://localhost:5173?x=1'])('refuses origin %s', origin => {
    expect(matchesCorsOrigin(example(), origin)).toBe(false)
  })
  it('allows an exact HTTPS origin only when explicitly configured and respects enabled', () => {
    const config = example()
    config.cors.origins = ['https://frontend.example.com']
    expect(matchesCorsOrigin(validateMockConfig(config), 'https://frontend.example.com')).toBe(true)
    expect(matchesCorsOrigin(config, 'https://frontend.example.com:444')).toBe(false)
    config.cors.enabled = false
    expect(matchesCorsOrigin(config, 'https://frontend.example.com')).toBe(false)
  })
  it.each(['*', 'https://*', 'http://example.com:*', 'http://localhost:*/path', 'http://localhost:3000/', 'http://user:password@localhost:3000', 'file:///tmp', 'null', 'http://localhost:80'])('refuses unsafe/non-canonical configured origin %s', origin => {
    expect(change(c => { c.cors.origins = [origin] })).toThrow()
  })
  it('requires at least one origin only when enabled and refuses duplicate origins', () => {
    expect(change(c => { c.cors.origins = [] })).toThrow()
    expect(change(c => { c.cors.origins = ['http://localhost:*', 'http://localhost:*'] })).toThrow()
    const config = change(c => { c.cors.enabled = false; c.cors.origins = [] })()
    expect(matchesCorsOrigin(config, 'http://localhost:3000')).toBe(false)
  })
})
