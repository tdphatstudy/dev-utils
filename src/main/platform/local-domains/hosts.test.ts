import { afterEach, describe, expect, it } from 'vitest'
import { buildHostsCommand, hostsPath } from './hosts'
import { patchManagedHosts } from '@shared/local-domains/hosts'
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
const execute = promisify(execFile), directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))) })
function windowsScript(before: Buffer, next: Buffer, deadline?: number): { file: string; script: string } {
  const command = buildHostsCommand('win32', before, next, deadline)
  const outer = Buffer.from(command.args[3], 'base64').toString('utf16le')
  expect(outer).toContain('-Verb RunAs -WindowStyle Hidden')
  const inner = outer.match(/'-EncodedCommand','([A-Za-z0-9+/=]+)'/)![1]
  const script = Buffer.from(inner, 'base64').toString('utf16le')
  return { file: command.file, script }
}
describe('privileged hosts command generation', () => {
  it('uses inline code, fixed OS paths, a hash guard, backup and expired-authorization checks on each platform', () => {
    const before = Buffer.from('127.0.0.1 localhost\n'), next = Buffer.from(patchManagedHosts(before.toString('latin1'), 'toi.vn', true), 'latin1')
    const win = windowsScript(before, next, 123456)
    expect(win.script).toContain('123456'); expect(win.script).toContain('Hosts changed while waiting')
    expect(win.script).toContain('FileShare]::None'); expect(win.script).toContain('devfusion-backup-')
    expect(win.script).toContain('FromBase64String'); expect(win.script).toContain('$f.Flush($true)')
    const linux = buildHostsCommand('linux', before, next, 123456)
    expect(linux.file).toBe('/usr/bin/pkexec'); expect(linux.args.slice(0, 2)).toEqual(['/usr/bin/perl', '-e'])
    expect(linux.args[2]).toContain('O_NOFOLLOW'); expect(linux.args[2]).toContain('LOCK_EX')
    expect(linux.args[2]).toContain('sha256_hex'); expect(linux.args[2]).toContain('original restored')
    const mac = buildHostsCommand('darwin', before, next)
    expect(mac.file).toBe('/usr/bin/osascript'); expect(mac.args[1]).toContain('with administrator privileges')
    const quoted = JSON.parse(mac.args[1].replace(/^do shell script /, '').replace(/ with administrator privileges$/, ''))
    expect(quoted).toContain("'\\''")
    expect(quoted).toContain('dscacheutil'); expect(quoted).toContain('mDNSResponder')
    expect(hostsPath('linux')).toBe('/etc/hosts')
  })
  it('refuses payloads that exceed safe inline command limits before launching anything', () => {
    expect(() => buildHostsCommand('win32', Buffer.alloc(20000), Buffer.alloc(20000))).toThrow(/inline/)
    expect(() => buildHostsCommand('linux', Buffer.alloc(100000), Buffer.alloc(100000))).toThrow(/inline/)
    expect(() => buildHostsCommand('freebsd', Buffer.alloc(0), Buffer.alloc(0))).toThrow(/supported/)
  })
  it.skipIf(process.platform !== 'win32')('executes the actual Windows write algorithm on a TEMP fixture, preserves bytes and refuses stale snapshots', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'devfusion-hosts-fixture-')); directories.push(directory)
    const path = join(directory, 'hosts-FIXTURE')
    const before = Buffer.from('# untouched\r\n192.0.2.1 alias.test # comment\r\n'), next = Buffer.from(patchManagedHosts(before.toString('latin1'), 'toi.vn', true), 'latin1')
    await writeFile(path, before)
    const command = windowsScript(before, next)
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
})
