import { describe, expect, it } from 'vitest'
import { applyQueryToUrl, buildBody, buildHttpPayload, newRow } from './build-request'

describe('buildHttpPayload', () => {
  it('retains repeated params, replaces existing matching values and keeps the fragment', () => {
    const url = new URL(applyQueryToUrl('https://example.com/?a=old&z=stay#fragment', [newRow('a', 'one'), newRow('a', 'two')]))
    expect(url.searchParams.getAll('a')).toEqual(['one', 'two'])
    expect(url.searchParams.get('z')).toBe('stay')
    expect(url.hash).toBe('#fragment')
    expect(applyQueryToUrl('invalid', [newRow('x', '\ud800')])).toBe('invalid')
  })
  it('preserves repeated URL-encoded fields', () => {
    expect(buildBody('urlencoded', '', [newRow('a', 'one'), newRow('a', 'two')]).body).toBe('a=one&a=two')
  })
  it('sends genuine multipart text fields with a matching boundary', async () => {
    const built = buildBody('form', '', [newRow('a', 'one'), newRow('a', 'two'), newRow('unicode', 'Xin chào 👋'), newRow('empty', '')])
    const request = new Request('http://example.test', { method: 'POST', headers: { 'Content-Type': built.contentType! }, body: built.body })
    const fields = await request.formData()
    expect(fields.getAll('a')).toEqual(['one', 'two'])
    expect(fields.get('unicode')).toBe('Xin chào 👋')
    expect(fields.get('empty')).toBe('')
  })
  it('preserves special header keys and treats names case-insensitively', () => {
    const result = buildHttpPayload({ method: 'POST', url: 'http://example.test', query: [], headers: [newRow('__proto__', 'value'), newRow('X-TEST', 'old'), newRow('x-test', 'new')], bodyMode: 'none', bodyText: '', formRows: [] })
    expect(Object.keys(result.headers)).toEqual(['__proto__', 'x-test'])
    expect(result.headers.__proto__).toBe('value')
    expect(result.headers['x-test']).toBe('new')
  })
  it('merges query into url', () => {
    const url = applyQueryToUrl('https://example.com/path', [
      { ...newRow('q', '1'), id: '1' },
      { ...newRow('x', 'y'), id: '2' }
    ])
    expect(url).toContain('q=1')
    expect(url).toContain('x=y')
  })

  it('sets json content-type', () => {
    const p = buildHttpPayload({
      method: 'POST',
      url: 'https://example.com',
      headers: [],
      query: [],
      bodyMode: 'json',
      bodyText: '{"a":1}',
      formRows: []
    })
    expect(p.headers['Content-Type']).toBe('application/json')
    expect(p.body).toBe('{"a":1}')
  })

  it('skips body for GET', () => {
    const p = buildHttpPayload({
      method: 'GET',
      url: 'https://example.com',
      headers: [],
      query: [],
      bodyMode: 'json',
      bodyText: '{}',
      formRows: []
    })
    expect(p.body).toBeUndefined()
  })
})
