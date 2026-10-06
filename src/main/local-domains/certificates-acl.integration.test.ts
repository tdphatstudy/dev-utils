import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { MkcertCertificates } from './certificates'
const execute = promisify(execFile), directories: string[] = []
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))) })

it.skipIf(process.platform !== 'win32')('applies a real user-only Windows ACL before any CA key can be created', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'devfusion-ca-acl-fixture-')); directories.push(directory)
  // An empty PATH directory deliberately makes mkcert unavailable: this test
  // cannot install a CA or invoke the real binary/trust store.
  vi.stubEnv('PATH', directory)
  const root = join(directory, 'storage'), certs = new MkcertCertificates(root)
  expect(await certs.available()).toBe(false)
  await expect(certs.install()).rejects.toThrow(/CA setup did not complete/)
  expect(await readdir(join(root, 'ca'))).toEqual([])
  const script = "$ErrorActionPreference='Stop'; $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value; $acl=[IO.Directory]::GetAccessControl($env:DEVFUSION_TEST_CA); $rules=@(); foreach ($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) { $rules += $rule.IdentityReference.Value }; [Console]::WriteLine($sid + '|' + $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value + '|' + $acl.AreAccessRulesProtected + '|' + ($rules -join ','))"
  for (const path of [root, join(root, 'ca')]) {
    const result = await execute(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 10000, env: { ...process.env, DEVFUSION_TEST_CA: path } })
    const [user, owner, protectedAcl, rules] = result.stdout.trim().split('|')
    expect(protectedAcl).toBe('True'); expect(owner).toBe(user)
    expect(rules.split(',')).toEqual([user])
  }
}, 30000)
