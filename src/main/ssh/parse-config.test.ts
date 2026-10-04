import { describe, expect, it } from 'vitest'
import { parseSshConfig, rewriteSshConfig, serializeHostBlock } from './parse-config'

const SAMPLE = `
# preamble
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519
  Port 22

Host myserver
  HostName 10.0.0.5
  User deploy
  Port 2222
  IdentityFile ~/.ssh/id_rsa

Host *
  ServerAliveInterval 60
`

describe('parseSshConfig', () => {
  it('parses host blocks', () => {
    const hosts = parseSshConfig(SAMPLE)
    expect(hosts.length).toBeGreaterThanOrEqual(2)
    const gh = hosts.find((h) => h.alias === 'github.com')
    expect(gh?.user).toBe('git')
    expect(gh?.hostName).toBe('github.com')
    expect(gh?.identityFile).toContain('id_ed25519')
    const ms = hosts.find((h) => h.alias === 'myserver')
    expect(ms?.port).toBe(2222)
    expect(ms?.user).toBe('deploy')
  })

  it('rewrites config keeping Host * and preamble', () => {
    const hosts = parseSshConfig(SAMPLE).filter((h) => h.alias !== 'myserver')
    hosts.push({
      alias: 'newbox',
      patterns: ['newbox'],
      hostName: '1.2.3.4',
      user: 'root',
      port: 22,
      options: {}
    })
    const out = rewriteSshConfig(SAMPLE, hosts)
    expect(out).toContain('# preamble')
    expect(out).toContain('Host *')
    expect(out).toContain('ServerAliveInterval 60')
    expect(out).toContain('Host newbox')
    expect(out).toContain('HostName 1.2.3.4')
    expect(out).not.toContain('Host myserver')
    expect(out).toContain('Host github.com')
  })

  it('serializes host block', () => {
    const s = serializeHostBlock({
      alias: 'x',
      patterns: ['x'],
      hostName: 'h',
      user: 'u',
      port: 2222,
      identityFile: '~/.ssh/id_ed25519',
      options: {}
    })
    expect(s).toContain('Host x')
    expect(s).toContain('Port 2222')
  })
})
