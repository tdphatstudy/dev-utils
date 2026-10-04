import { describe, expect, it } from 'vitest'
import { generateSnippet } from './snippets'
import type { HttpRequestPayload } from './types'
import { runInNewContext } from 'node:vm'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

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
  it('generated fetch executes with exact Unicode/binary text and special header keys', async () => {
    const headers: Record<string, string> = Object.create(null)
    headers.__proto__ = 'literal-header'
    headers['X-Test'] = '$() \\ quotes\'"'
    const req = { ...sample, headers, body: "@not-a-file\r\n'@\nXin chào 👋\0", url: 'https://example.com/path?q=a&other=b' }
    let captured: { url: string; options: RequestInit } | undefined
    await runInNewContext(`(async () => { ${generateSnippet('fetch', req)} })()`, {
      JSON, AbortSignal: { timeout: () => ({}) }, console: { log: () => {} },
      fetch: async (url: string, options: RequestInit) => { captured = { url, options }; return { status: 200, text: async () => '' } }
    })
    expect(captured?.url).toBe(req.url)
    expect(captured?.options.body).toBe(req.body)
    expect((captured?.options.headers as Record<string, string>).__proto__).toBe('literal-header')
    expect(captured?.options.redirect).toBe('manual')
  })
  it('keeps empty bodies and uses literal body data for shell exports', () => {
    for (const id of ['curl', 'powershell', 'fetch', 'python', 'httpie', 'go', 'java'] as const) {
      expect(generateSnippet(id, { ...sample, body: '' })).toMatch(/data-raw|\$body|body:|"data"|data=data|printf|DecodeString|ofByteArray/)
    }
    expect(generateSnippet('curl', { ...sample, body: '@file\\path' })).toContain("--data-raw '@file\\path'")
    expect(generateSnippet('httpie', sample)).toContain("printf '%s'")
    expect(generateSnippet('httpie', sample)).not.toContain('<<<')
    expect(generateSnippet('go', { ...sample, method: 'GET', body: undefined })).not.toContain('"strings"')
  })
  it('Axios retains an empty body and special header keys in the generated configuration', async () => {
    const headers: Record<string, string> = Object.create(null)
    headers.__proto__ = 'literal'
    let config: any
    const code = generateSnippet('axios', { ...sample, headers, body: '' }).replace("import axios from 'axios'", '')
    await runInNewContext(`(async () => { ${code} })()`, { JSON, console: { log: () => {} }, axios: async (value: unknown) => { config = value; return { status: 200, data: '' } } })
    expect(config.data).toBe('')
    expect(config.headers.__proto__).toBe('literal')
    expect(config.maxRedirects).toBe(0)
    expect(config.validateStatus(422)).toBe(true)
  })
  const hasPwsh = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.Major'], { encoding: 'utf8' }).status === 0
  it.skipIf(!hasPwsh)('PowerShell executes literal values without expansion or here-string termination', () => {
    const req = { ...sample, headers: { 'X-Test': '$(throw "expanded") ` $value \\ \' quote' }, body: "'@\r\nthrow 'expanded'\nXin chào 👋\0" }
    const stub = `function Invoke-RestMethod { param($Method, $Uri, $Headers, [byte[]]$Body, $TimeoutSec, $MaximumRedirection, [switch]$SkipHttpErrorCheck) @{ url=$Uri; headers=$Headers; body=[Convert]::ToBase64String($Body) } | ConvertTo-Json -Compress -Depth 5 }\n`
    const script = stub + generateSnippet('powershell', req)
    const result = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { encoding: 'utf8' })
    expect(result.status, result.stderr).toBe(0)
    const captured = JSON.parse(result.stdout.trim())
    expect(captured.url).toBe(req.url)
    expect(captured.headers['X-Test']).toBe(req.headers['X-Test'])
    expect(Buffer.from(captured.body, 'base64').toString('utf8')).toBe(req.body)
  })
  const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash'
  it.skipIf(!existsSync(bash))('Bash cURL arguments preserve backslashes, apostrophes and shell metacharacters', () => {
    const req = { ...sample, body: '@not-file\\path\n$(echo expanded) \' quote', headers: { 'X-Test': '$(echo expanded) \\ \' value' } }
    const script = `curl() { printf '%s\\0' "$@"; }\n` + generateSnippet('curl', req)
    const result = spawnSync(bash, ['-c', script], { encoding: 'utf8' })
    expect(result.status, result.stderr).toBe(0)
    const args = result.stdout.split('\0')
    expect(args[args.indexOf('--data-raw') + 1]).toBe(req.body)
    expect(args[args.indexOf('-H') + 1]).toBe('X-Test:' + ' ' + req.headers['X-Test'])
  })
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
