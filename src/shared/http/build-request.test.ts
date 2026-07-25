import { describe, expect, it } from 'vitest'
import { applyQueryToUrl, buildHttpPayload, newRow } from './build-request'

describe('buildHttpPayload', () => {
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
