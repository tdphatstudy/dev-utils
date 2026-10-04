import { describe, expect, it } from 'vitest'
import { parseIp, parseCidr } from './ip'

describe('IP parsing', () => {
  it.each(['1..2.3', '+1.2.3.4', '1e2.2.3.4', '0x10.2.3.4', '01.2.3.4', '256.1.2.3', '1:2', ':1', '1:', ':::1', '1::2::3', '12345::', '1:2:3:4:5:6:7:8:9', '1:2:3:4:5:6:7::8'])('rejects malformed address %s', (input) => {
    expect(parseIp(input)).toBeNull()
  })
  it.each(['::', '::1', '2001:db8::1', '1:2:3:4:5:6:7:8', '::ffff:192.168.1.2'])('accepts IPv6 address %s', (input) => {
    expect(parseIp(input)?.version).toBe(6)
  })
  it('classifies expanded loopback and the complete link-local prefix', () => {
    expect(parseIp('0:0:0:0:0:0:0:1')?.isLoopback).toBe(true)
    expect(parseIp('febf::1')?.isLinkLocal).toBe(true)
    expect(parseIp('fec0::1')?.isLinkLocal).toBe(false)
    expect(parseIp('fd12::1')?.isPrivate).toBe(true)
  })
})

describe('IPv4 subnet calculation', () => {
  it('masks host bits and calculates endpoints', () => {
    expect(parseCidr('192.168.1.37/24')).toEqual({ ok: true, network: '192.168.1.0', prefix: 24, hostCount: 256, netmask: '255.255.255.0', broadcast: '192.168.1.255', firstHost: '192.168.1.1', lastHost: '192.168.1.254', usableHosts: 254 })
  })
  it('handles zero, point-to-point and host routes without signed overflow', () => {
    expect(parseCidr('255.255.255.255/0')).toMatchObject({ network: '0.0.0.0', broadcast: '255.255.255.255', hostCount: 4294967296 })
    expect(parseCidr('10.0.0.3/31')).toMatchObject({ firstHost: '10.0.0.2', lastHost: '10.0.0.3', usableHosts: 2 })
    expect(parseCidr('255.255.255.255/32')).toMatchObject({ firstHost: '255.255.255.255', lastHost: '255.255.255.255', usableHosts: 1 })
  })
  it.each(['1.2.3.4/', '1.2.3.4/24/2', '1.2.3.4/1e1', '1.2.3.4/33', '::1/128'])('rejects malformed or unsupported subnet %s', (input) => {
    expect(parseCidr(input).ok).toBe(false)
  })
})
