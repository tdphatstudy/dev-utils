import { describe, expect, it } from 'vitest'
import { hostFromInput, parseSshConfig, patchSshHostConfig, rewriteSshConfig, serializeHostBlock } from './parse-config'

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

  it('preserves untouched bytes, first values, quoted hashes, repeated directives and Match scopes', () => {
    const config = '# company\r\nInclude "company # defaults"\r\nHost box # label\r\n\tHostName = old # address\r\n  User first\r\n  User second\r\n  IdentityFile "~/.ssh/key # one"\r\n  IdentityFile ~/.ssh/second\r\n  LocalForward 8080 localhost:80\r\n  LocalForward 9090 localhost:90\r\nMatch host box\r\n  User conditional\r\nHost *\r\n  User global\r\n'
    const hosts = parseSshConfig(config)
    expect(hosts[0].user).toBe('first')
    expect(hosts[0].identityFile).toBe('~/.ssh/key # one')
    const out = patchSshHostConfig(config, { originalAlias: 'box', alias: 'box', hostName: 'new', user: 'first', port: 22, identityFile: '~/.ssh/key # one' })
    expect(out).toBe(config.replace('old # address', 'new # address'))
    expect(patchSshHostConfig(config, { originalAlias: 'box', alias: 'box', hostName: 'old', user: 'first', port: 22, identityFile: '~/.ssh/key # one' })).toBe(config)
    expect(() => patchSshHostConfig(config, { originalAlias: 'box', alias: 'box', user: 'changed' })).toThrow('Repeated user')
  })

  it('deletes only the concrete host directives, preserving Match and surrounding comments', () => {
    const text = '# preamble\nHost box\n  User deploy\n  # note\n\nMatch host box\n  User other\nHost *\n  ServerAliveInterval 60\n'
    expect(patchSshHostConfig(text, null, 'box')).toBe('# preamble\n  # note\n\nMatch host box\n  User other\nHost *\n  ServerAliveInterval 60\n')
  })

  it('inserts new specific hosts before conditional defaults with explicit port 22', () => {
    const text = '# preamble\r\nHost *\r\n  Port 2222\r\n  User global'
    const out = patchSshHostConfig(text, { alias: 'new', hostName: 'example.com', port: 22 })
    expect(out).toBe('# preamble\r\nHost new\r\n  HostName example.com\r\n  Port 22\r\n\r\nHost *\r\n  Port 2222\r\n  User global')
  })

  it('refuses ambiguous/pattern edits, missing targets, duplicate names and line injection', () => {
    for (const config of ['Host box other\n User a\n', 'Host box\n User a\nHost box\n User b\n', 'Host *\n User a\n']) {
      const alias = config.includes('*') ? '*' : 'box'
      expect(parseSshConfig(config)[0].readOnlyReason).toBeTruthy()
      expect(() => patchSshHostConfig(config, null, alias)).toThrow()
    }
    expect(() => patchSshHostConfig('Host old\n', { originalAlias: 'missing', alias: 'missing' })).toThrow('no longer exists')
    expect(() => patchSshHostConfig('Host old\nHost taken\n', { originalAlias: 'old', alias: 'taken' })).toThrow('already exists')
    for (const input of [{ alias: 'x', user: 'a\nProxyCommand evil' }, { alias: '*'}, { alias: 'x', port: 22.5 }, { alias: 'x', port: 65536 }]) expect(() => hostFromInput(input)).toThrow()
  })

  it('renames in place and quotes paths containing spaces or hashes without dropping options', () => {
    const text = 'Host old # keep\n  IdentityFile ~/.ssh/old\n  ProxyJump relay\n'
    const out = patchSshHostConfig(text, { originalAlias: 'old', alias: 'new', identityFile: 'C:/key folder/key # 1', port: 22 })
    expect(out).toBe('Host new # keep\n  IdentityFile "C:/key folder/key # 1"\n  ProxyJump relay\n')
    expect(parseSshConfig(out)[0].identityFile).toBe('C:/key folder/key # 1')
  })
})
