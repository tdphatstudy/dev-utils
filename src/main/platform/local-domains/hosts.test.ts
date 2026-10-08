import { afterEach, describe, expect, it } from 'vitest'
import { buildHostsCommand, hostsPath, MAX_HOSTS_BYTES, type HostsChange } from './hosts'
import { patchManagedHosts, removeManagedHosts } from '@shared/local-domains/hosts'
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
const execute = promisify(execFile), directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))) })
function windowsScript(before: Buffer, change: HostsChange, deadline?: number): { file: string; script: string } {
  const command = buildHostsCommand('win32', before, change, deadline)
  expect(command.args[2]).toBe('-Command')
  const outer = command.args[3]
  expect(outer).toContain('-Verb RunAs -WindowStyle Hidden')
  const inner = outer.match(/'-EncodedCommand','([A-Za-z0-9+/=]+)'/)![1]
  const script = Buffer.from(inner, 'base64').toString('utf16le')
  return { file: command.file, script }
}
describe('privileged hosts command generation', () => {
  it('uses inline code, fixed OS paths, a hash guard, backup and expired-authorization checks on each platform', () => {
    const before = Buffer.from('127.0.0.1 localhost\n'), change = { domain: 'toi.vn', enabled: true }
    const win = windowsScript(before, change, 123456)
    expect(win.script).toContain('123456'); expect(win.script).toContain('Hosts changed while waiting')
    expect(win.script).toContain('FileShare]::None'); expect(win.script).toContain('devfusion-backup-')
    expect(win.script).toContain('FromBase64String'); expect(win.script).toContain('$f.Flush($true)')
    const linux = buildHostsCommand('linux', before, change, 123456)
    expect(linux.file).toBe('/usr/bin/pkexec'); expect(linux.args.slice(0, 2)).toEqual(['/usr/bin/perl', '-e'])
    expect(linux.args[2]).toContain('O_NOFOLLOW'); expect(linux.args[2]).toContain('LOCK_EX')
    expect(linux.args[2]).toContain('sha256_hex'); expect(linux.args[2]).toContain('original restored')
    const mac = buildHostsCommand('darwin', before, change)
    expect(mac.file).toBe('/usr/bin/osascript'); expect(mac.args[1]).toContain('with administrator privileges')
    const quoted = JSON.parse(mac.args[1].replace(/^do shell script /, '').replace(/ with administrator privileges$/, ''))
    expect(quoted).toContain("'\\''")
    expect(quoted).toContain('dscacheutil'); expect(quoted).toContain('mDNSResponder')
    expect(hostsPath('linux')).toBe('/etc/hosts')
  })
  it.each(['win32', 'darwin', 'linux'] as const)('keeps %s commands bounded for large hosts, long domains and orphan cleanup', (platform) => {
    const domain = ['a'.repeat(63), 'b'.repeat(63), 'c'.repeat(63), 'd'.repeat(61)].join('.')
    expect(domain).toHaveLength(253)
    const small = Buffer.from('# unrelated hosts bytes\r\n')
    const large = Buffer.from(small.toString().repeat(40000))
    const change = { domain, enabled: true }
    const short = buildHostsCommand(platform, small, change), long = buildHostsCommand(platform, large, change)
    expect(long.args.join(' ').length).toBe(short.args.join(' ').length)
    expect(long.args.join(' ').length).toBeLessThan(28000)
    const orphans = Buffer.from(Array.from({ length: 2000 }, (_, i) => `127.0.0.1\torphan${i}.test\t# DevFusion local-domain orphan${i}.test\r\n# unrelated ${i}\r\n`).join(''))
    expect(buildHostsCommand(platform, orphans, { removeAll: true }).args.join(' ').length).toBeLessThan(28000)
    expect(() => buildHostsCommand(platform, Buffer.alloc(MAX_HOSTS_BYTES + 1), change)).toThrow(/too large/)
    expect(() => buildHostsCommand(platform, Buffer.from('#' + 'x'.repeat(MAX_HOSTS_BYTES - 2) + '\n'), change)).toThrow(/too large/)
    expect(() => buildHostsCommand(platform, small, { domain: "app.test'; exit", enabled: true })).toThrow(/domain/)
    expect(() => buildHostsCommand(platform, Buffer.from('127.0.0.1 app.test alias.test # DevFusion local-domain app.test\n'), { removeAll: true })).toThrow(/modified/)
  })
  it('refuses unsupported platforms', () => {
    expect(() => buildHostsCommand('freebsd', Buffer.alloc(0), { removeAll: true })).toThrow(/supported/)
  })
  it.skipIf(process.platform !== 'win32')('executes the actual Windows write algorithm on a TEMP fixture, preserves bytes and refuses stale snapshots', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'devfusion-hosts-fixture-')); directories.push(directory)
    const path = join(directory, 'hosts-FIXTURE')
    const before = Buffer.from('# untouched\r\n192.0.2.1 alias.test # comment\r\n'), next = Buffer.from(patchManagedHosts(before.toString('latin1'), 'toi.vn', true), 'latin1')
    await writeFile(path, before)
    const command = windowsScript(before, { domain: 'toi.vn', enabled: true })
    // Never execute the elevated wrapper or the real OS-path/flush statements.
    // Only the write algorithm runs against a dedicated file in TEMP.
    const script = command.script.slice(0, command.script.indexOf('& ([IO.Path]::Combine'))
      .replace(/^\$p = .*$/m, '$p = $env:DEVFUSION_TEST_HOSTS')
    expect(script).not.toContain('ipconfig'); expect(script).not.toContain('RunAs')
    await execute(command.file, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 15000, env: { ...process.env, DEVFUSION_TEST_HOSTS: path } })
    expect(await readFile(path)).toEqual(next)
    const backup = (await readdir(directory)).find((name) => name.startsWith('hosts-FIXTURE.devfusion-backup-'))!
    expect(await readFile(join(directory, backup))).toEqual(before)
    await expect(execute(command.file, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 15000, env: { ...process.env, DEVFUSION_TEST_HOSTS: path } })).rejects.toThrow()
    expect(await readFile(path)).toEqual(next)
    expect(await readdir(directory)).toHaveLength(2)
  }, 40000)
  it.skipIf(process.platform !== 'win32')('adds, repairs, disables and batch-cleans a large byte-preserving TEMP hosts file through the Windows helper', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'devfusion-large-hosts-fixture-')); directories.push(directory)
    const path = join(directory, 'hosts-FIXTURE')
    const byteComment = Buffer.concat([Buffer.from('# raw bytes '), Buffer.from(Array.from({ length: 128 }, (_, i) => i + 128)), Buffer.from('\r\n')])
    const original = Buffer.concat([Buffer.from('\ufeff# Tiếng Việt\r\n192.0.2.1 alias.test # preserve\n# CR-only line\r'), byteComment, Buffer.from('# unrelated\r\n'.repeat(20000))])
    let current = original
    await writeFile(path, current)
    const apply = async (change: HostsChange) => {
      const expected = Buffer.from('domain' in change ? patchManagedHosts(current.toString('latin1'), change.domain, change.enabled) : removeManagedHosts(current.toString('latin1')), 'latin1')
      const command = windowsScript(current, change)
      const script = command.script.slice(0, command.script.indexOf('& ([IO.Path]::Combine'))
        .replace(/^\$p = .*$/m, '$p = $env:DEVFUSION_TEST_HOSTS')
      const encoded = Buffer.from(script, 'utf16le').toString('base64')
      // Exercise the actual wrapper/child transport without elevation or DNS IO.
      const outer = buildHostsCommand('win32', current, change).args[3]
        .replace(/'-EncodedCommand','[A-Za-z0-9+/=]+'/g, `'-EncodedCommand','${encoded}'`)
        .replace(' -Verb RunAs', '')
      expect(outer).not.toContain('RunAs')
      await execute(command.file, ['-NoProfile', '-NonInteractive', '-Command', outer], { windowsHide: true, timeout: 15000, env: { ...process.env, DEVFUSION_TEST_HOSTS: path } })
      expect(await readFile(path)).toEqual(expected)
      const backups = (await readdir(directory)).filter((name) => name.startsWith('hosts-FIXTURE.devfusion-backup-'))
      expect(await Promise.all(backups.map((name) => readFile(join(directory, name))))).toContainEqual(current)
      current = expected
    }
    await apply({ domain: 'app.test', enabled: true })
    await apply({ domain: 'other.test', enabled: true })
    await apply({ domain: 'app.test', enabled: true })
    await apply({ domain: 'app.test', enabled: false })
    await apply({ removeAll: true })
    expect(current).toEqual(original)
  }, 90000)
  it.skipIf(process.platform !== 'win32')('refuses expired authorization and a mismatched generated result before creating a backup', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'devfusion-hosts-refusal-fixture-')); directories.push(directory)
    const path = join(directory, 'hosts-FIXTURE'), before = Buffer.from('# untouched\n')
    await writeFile(path, before)
    for (const expired of [true, false]) {
      const command = windowsScript(before, { domain: 'app.test', enabled: true }, expired ? 1 : undefined)
      let script = command.script.slice(0, command.script.indexOf('& ([IO.Path]::Combine'))
        .replace(/^\$p = .*$/m, '$p = $env:DEVFUSION_TEST_HOSTS')
      if (!expired) script = script.replace("$bytes = $encoding.GetBytes($patched +", "$bytes = $encoding.GetBytes('changed' + $patched +")
      await expect(execute(command.file, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 15000, env: { ...process.env, DEVFUSION_TEST_HOSTS: path } })).rejects.toThrow()
      expect(await readFile(path)).toEqual(before)
      expect(await readdir(directory)).toEqual(['hosts-FIXTURE'])
    }
  }, 40000)
})
