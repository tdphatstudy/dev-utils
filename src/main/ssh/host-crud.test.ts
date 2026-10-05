import { afterEach, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { deleteHost, listHostsFromConfig, upsertHost } from './crud'

const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))) })

it('keeps custom config bytes and recovery backup across targeted edits and deletion', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'devutils-ssh-config-'))
  directories.push(dir)
  const location = { sshDir: dir, configPath: join(dir, 'custom-config') }
  const original = '# keep\r\nHost box\r\n  HostName old\r\n  IdentityFile "~/.ssh/key # one"\r\n  LocalForward 1234 localhost:80\r\n  LocalForward 2345 localhost:90\r\nMatch host box\r\n  User conditional\r\nHost *\r\n  User global'
  await writeFile(location.configPath, original)
  const hosts = await listHostsFromConfig(location)
  expect(hosts[0].identityFile).toBe('~/.ssh/key # one')
  await upsertHost({ ...hosts[0], originalAlias: 'box', hostName: 'new' }, location)
  expect(await readFile(location.configPath, 'utf8')).toBe(original.replace('HostName old', 'HostName new'))
  expect(await readFile(`${location.configPath}.bak`, 'utf8')).toBe(original)
  await deleteHost('box', location)
  expect(await readFile(location.configPath, 'utf8')).toBe('# keep\r\nMatch host box\r\n  User conditional\r\nHost *\r\n  User global')
  if (process.platform !== 'win32') {
    expect((await stat(location.configPath)).mode & 0o777).toBe(0o600)
    expect((await stat(`${location.configPath}.bak`)).mode & 0o777).toBe(0o600)
  }
})

it('serializes concurrent config changes and refuses stale missing aliases without writing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'devutils-ssh-concurrent-'))
  directories.push(dir)
  const location = { sshDir: dir }
  await Promise.all(['first', 'second', 'third'].map((alias) => upsertHost({ alias, user: alias, port: 22 }, location)))
  expect((await listHostsFromConfig(location)).map((h) => h.alias).sort()).toEqual(['first', 'second', 'third'])
  const text = await readFile(join(dir, 'config'), 'utf8')
  await expect(upsertHost({ originalAlias: 'missing', alias: 'missing' }, location)).rejects.toThrow('no longer exists')
  expect(await readFile(join(dir, 'config'), 'utf8')).toBe(text)
})

it('OpenSSH reads a newly added explicit host ahead of wildcard defaults without connecting', async (context) => {
  const dir = await mkdtemp(join(tmpdir(), 'devutils-ssh-native-'))
  directories.push(dir)
  const configPath = join(dir, 'config')
  await writeFile(configPath, 'Host *\n  User default-user\n  Port 2222\n  CanonicalizeHostname no\n')
  await upsertHost({ alias: 'devutils-fixture', hostName: '127.0.0.1', user: 'specific-user', port: 22, identityFile: 'C:/key folder/key # 1' }, { sshDir: dir, configPath })
  let stdout: string
  try { ({ stdout } = await promisify(execFile)('ssh', ['-G', '-F', configPath, 'devutils-fixture'], { windowsHide: true, timeout: 5000 })) }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') { context.skip(); return }
    throw e
  }
  expect(stdout).toMatch(/^hostname 127\.0\.0\.1$/m)
  expect(stdout).toMatch(/^user specific-user$/m)
  expect(stdout).toMatch(/^port 22$/m)
  expect(stdout).toMatch(/^identityfile C:\/key folder\/key # 1$/m)
})
