import { describe, expect, it } from 'vitest'
import { MOCK_EXAMPLE_YAML, MOCK_LIMITS, matchMockRequest, parseMockConfig, parseMockTarget } from './index'

describe('Mock API origin-form request target', () => {
  it('preserves raw encoded path and dot segments instead of normalizing them', () => {
    const target = parseMockTarget('/api/users/../users?role=admin')
    expect(target.path).toBe('/api/users/../users')
    expect(matchMockRequest(parseMockConfig(MOCK_EXAMPLE_YAML), { ...target, method: 'GET', headers: { authorization: 'fixture' } })).toBeNull()
    expect(parseMockTarget('/api/%75sers').path).toBe('/api/%75sers')
    expect(parseMockTarget('/api/users/%2e%2e').path).toBe('/api/users/%2e%2e')
    expect(parseMockTarget('/api/users/%252f').path).toBe('/api/users/%252f')
  })

  it('strictly decodes repeated query values once and uses the first question mark only', () => {
    const result = parseMockTarget('/query?role=user&role=admin&value=a?b&space=hello+world&literal=%252f&plus=%2B&empty&eq=a=b')
    expect(result.query).toEqual({ role: ['user', 'admin'], value: ['a?b'], space: ['hello world'], literal: ['%2f'], plus: ['+'], empty: [''], eq: ['a=b'] })
    expect(Object.getPrototypeOf(result.query)).toBeNull()
    expect(parseMockTarget('/query?value=%C3%A9').query.value).toEqual(['é'])
    expect(parseMockTarget('/query?value=%23%5C').query.value).toEqual(['#\\'])
  })

  it('retains empty query parts consistently and handles reserved keys without modifying prototypes', () => {
    expect(parseMockTarget('/query?a=1&&b=2&').query).toEqual({ a: ['1'], '': ['', ''], b: ['2'] })
    expect(parseMockTarget('/query?__proto__=one&constructor=two').query).toEqual(Object.fromEntries([['__proto__', ['one']], ['constructor', ['two']]]))
    expect({}).not.toHaveProperty('polluted')
    expect(parseMockTarget('/query?').query).toEqual({})
  })

  it.each(['', 'api/users', 'https://example.test/users', '//example.test/users', '/api/users#fragment', '/query?token=secret#fragment', '/query?value=raw space', '/query?value=raw\tcontrol', '/api\\users', '/query?value=\\'])('rejects a malformed raw target %j', target => {
    expect(() => parseMockTarget(target)).toThrow('Invalid request URL')
  })

  it.each(['/api/%ZZ', '/api/%', '/api/%FF', '/api/%00', '/api/%7F', '/api/%5C', '/query?value=%ZZ', '/query?%FF=value', '/query?value=%00', '/query?value=%1F', '/query?value=%7F'])('rejects invalid UTF-8 escapes or decoded controls %s', target => {
    expect(() => parseMockTarget(target)).toThrow('Invalid URL encoding')
  })

  it('caps target size and never reflects secret target data in errors', () => {
    expect(() => parseMockTarget('/' + 'a'.repeat(MOCK_LIMITS.targetLength))).toThrow()
    expect(parseMockTarget('/' + 'a'.repeat(MOCK_LIMITS.targetLength - 1)).path).toHaveLength(MOCK_LIMITS.targetLength)
    try { parseMockTarget('/query?token=SECRET_AUTH_VALUE%ZZ') } catch (error) {
      expect(String(error)).not.toContain('SECRET_AUTH_VALUE')
    }
  })
})
