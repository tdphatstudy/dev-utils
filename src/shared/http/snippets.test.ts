import { describe, expect, it } from 'vitest'
import { generateSnippet } from './snippets'
import type { HttpRequestPayload } from './types'

const sample: HttpRequestPayload = {
  method: 'POST',
  url: 'https://httpbin.org/post',
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json'
  },
  body: '{"hello":"world"}'
}

describe('generateSnippet', () => {
  it('curl includes method and url', () => {
    const s = generateSnippet('curl', sample)
    expect(s).toContain('curl -X POST')
    expect(s).toContain('https://httpbin.org/post')
    expect(s).toContain('hello')
  })

  it('powershell uses Invoke-RestMethod', () => {
    const s = generateSnippet('powershell', sample)
    expect(s).toContain('Invoke-RestMethod')
    expect(s).toContain('POST')
  })

  it('fetch is valid-looking js', () => {
    const s = generateSnippet('fetch', sample)
    expect(s).toContain('fetch(')
    expect(s).toContain('method:')
  })

  it('python uses requests', () => {
    const s = generateSnippet('python', sample)
    expect(s).toContain('import requests')
    expect(s).toContain('requests.request')
  })
})
