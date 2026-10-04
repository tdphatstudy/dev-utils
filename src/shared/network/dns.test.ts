import { describe, expect, it } from 'vitest'
import { normalizeDnsHost, normalizeDnsInput } from './dns'

describe('DNS input', () => {
  it.each(['1', '1.2.3', '123.example', '0x7f000001', '001.002.003.004', '_sip._tcp.example.com', 'example.com.'])('preserves DNS labels in %s', (value) => {
    expect(normalizeDnsHost(value)).toEqual({ ok: true, hostname: value })
  })
  it('extracts full URL hostnames and converts international names', () => {
    expect(normalizeDnsHost(' HTTPS://EXAMPLE.COM:8443/path?q=1 ')).toEqual({ ok: true, hostname: 'example.com' })
    expect(normalizeDnsHost('münich.example')).toEqual({ ok: true, hostname: 'xn--mnich-kva.example' })
    expect(normalizeDnsHost('münich。example。')).toEqual({ ok: true, hostname: 'xn--mnich-kva.example.' })
  })
  it.each(['', 'a b.com', 'a\\b.com', 'example.com:443', 'example.com/path', 'ftp://example.com', '%61.com', '-bad.com', 'bad-.com', 'a..b', 'a'.repeat(64) + '.com', 'a\0b', 'https://[::1]/', 'a'.repeat(4097)])('rejects invalid or ambiguous input %s', (value) => {
    expect(normalizeDnsHost(value).ok).toBe(false)
  })
  it('accepts the maximum DNS name length with or without a trailing root dot', () => {
    const boundary = [63, 63, 63, 61].map((length) => 'a'.repeat(length)).join('.')
    expect(boundary.length).toBe(253)
    expect(normalizeDnsHost(boundary).ok).toBe(true)
    expect(normalizeDnsHost(boundary + '.').ok).toBe(true)
    expect(normalizeDnsHost(boundary + 'a').ok).toBe(false)
  })
  it.each(['1.1.1.1', '2606:4700:4700::1111', '::ffff:192.0.2.1'])('supports complete PTR address %s', (value) => {
    expect(normalizeDnsInput(value, 'PTR')).toEqual({ ok: true, hostname: value })
  })
  it.each(['1.2.3', 'example.com', 'https://1.1.1.1', '[::1]', '01.1.1.1', '::1%eth0'])('rejects non-address PTR input %s', (value) => {
    expect(normalizeDnsInput(value, 'PTR').ok).toBe(false)
  })
})
