import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { managedHostDomains, patchManagedHosts } from '@shared/local-domains/hosts'
import { readBoundedFile } from '../../bounded-read'

const execute = promisify(execFile)
export const MAX_HOSTS_BYTES = 1024 * 1024

export function hostsPath(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts') : '/etc/hosts'
}
export async function readSystemHosts(): Promise<string> {
  return (await readBoundedFile(hostsPath(), MAX_HOSTS_BYTES)).toString('latin1')
}
const shellQuote = (text: string): string => "'" + text.replace(/'/g, "'\\''") + "'"

export function buildHostsCommand(platform: NodeJS.Platform, original: Buffer, next: Buffer, deadline = Date.now() + 60000): { file: string; args: string[] } {
  if (original.length > MAX_HOSTS_BYTES || next.length > MAX_HOSTS_BYTES) throw new Error('Hosts file is too large.')
  const expected = createHash('sha256').update(original).digest('hex')
  const payload = next.toString('base64')
  if (platform === 'win32') {
    const script = `
$ErrorActionPreference = 'Stop'
if ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() -gt ${deadline}) { exit 12 }
$p = [IO.Path]::Combine([Environment]::GetFolderPath('Windows'), 'System32', 'drivers', 'etc', 'hosts')
$item = Get-Item -LiteralPath $p -Force
if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Refusing a linked hosts file' }
$f = [IO.File]::Open($p, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
try {
  if ($f.Length -gt ${MAX_HOSTS_BYTES}) { throw 'Hosts file is too large' }
  $b = New-Object byte[] ([int]$f.Length)
  $n = 0
  while ($n -lt $b.Length) { $r = $f.Read($b, $n, $b.Length - $n); if ($r -le 0) { throw 'Incomplete read' }; $n += $r }
  $sha = [Security.Cryptography.SHA256]::Create()
  try { $hash = ([BitConverter]::ToString($sha.ComputeHash($b))).Replace('-', '').ToLowerInvariant() } finally { $sha.Dispose() }
  if ($hash -ne '${expected}') { throw 'Hosts changed while waiting for authorization. Retry.' }
  if ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() -gt ${deadline}) { throw 'Authorization expired; retry' }
  $backup = $p + '.devfusion-backup-' + [Guid]::NewGuid().ToString('N')
  [IO.File]::WriteAllBytes($backup, $b)
  $bytes = [Convert]::FromBase64String('${payload}')
  try { $f.Position = 0; $f.Write($bytes, 0, $bytes.Length); $f.SetLength($bytes.Length); $f.Flush($true) }
  catch { $f.Position = 0; $f.Write($b, 0, $b.Length); $f.SetLength($b.Length); $f.Flush($true); throw }
} finally { $f.Dispose() }
& ([IO.Path]::Combine([Environment]::GetFolderPath('Windows'), 'System32', 'ipconfig.exe')) /flushdns | Out-Null
if ($LASTEXITCODE -ne 0) { exit 10 }
`
    const encoded = Buffer.from(script, 'utf16le').toString('base64')
    // The elevated process receives code inline; no writable temporary script
    // is ever executed as administrator.
    const outer = `$ErrorActionPreference='Stop'; $p=Start-Process -FilePath ([IO.Path]::Combine([Environment]::GetFolderPath('Windows'),'System32','WindowsPowerShell','v1.0','powershell.exe')) -ArgumentList @('-NoProfile','-NonInteractive','-EncodedCommand','${encoded}') -Verb RunAs -WindowStyle Hidden -Wait -PassThru; exit $p.ExitCode`
    const outerEncoded = Buffer.from(outer, 'utf16le').toString('base64')
    if (outerEncoded.length > 28000) throw new Error('Hosts is too large for a safe inline administrator command. Existing hosts were left unchanged.')
    return { file: join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), args: ['-NoProfile', '-NonInteractive', '-EncodedCommand', outerEncoded] }
  }
  if (platform !== 'darwin' && platform !== 'linux') throw new Error('Local domains are supported on Windows, macOS and Linux.')
  const perl = `
use strict; use warnings; use Fcntl qw(:DEFAULT :flock); use Digest::SHA qw(sha256_hex); use MIME::Base64 qw(decode_base64);
time()*1000 <= ${deadline} or die "Authorization expired";
my $p='/etc/hosts'; -l $p and die "Refusing linked hosts"; -f $p or die "Not a regular hosts file";
sysopen(my $f,$p,O_RDWR|O_NOFOLLOW) or die "Open hosts failed"; flock($f,LOCK_EX) or die "Lock failed";
binmode($f); my $old=''; while (1) { my $part=''; my $count=sysread($f,$part,65536); defined($count) or die "Read failed"; last unless $count; $old.=$part; length($old) <= ${MAX_HOSTS_BYTES} or die "Hosts too large"; }
sha256_hex($old) eq '${expected}' or die "Hosts changed while authorizing; retry";
time()*1000 <= ${deadline} or die "Authorization expired";
my $backup=$p.'.devfusion-backup-'.time().'-'.$$;
sysopen(my $b,$backup,O_WRONLY|O_CREAT|O_EXCL,0600) or die "Backup failed"; binmode($b); print $b $old or die "Backup write failed"; close($b) or die "Backup close failed";
my $new=decode_base64('${payload}');
sub replace_bytes { my ($handle,$bytes)=@_; defined(sysseek($handle,0,0)) or die "Seek failed"; my $offset=0; while ($offset < length($bytes)) { my $n=syswrite($handle,$bytes,length($bytes)-$offset,$offset); defined($n) && $n>0 or die "Write failed"; $offset+=$n; } truncate($handle,length($bytes)) or die "Truncate failed"; }
eval { replace_bytes($f,$new); 1 } or do { eval { replace_bytes($f,$old); 1 } or die "Write and rollback failed; restore the backup manually"; die "Write failed; original restored"; };
close($f) or die "Close failed; inspect hosts and backup";
`
  const flush = platform === 'darwin'
    ? "system('/usr/bin/dscacheutil','-flushcache') == 0 or exit 10; system('/usr/bin/killall','-HUP','mDNSResponder') == 0 or exit 10;"
    : "if (-x '/usr/bin/resolvectl') { system('/usr/bin/resolvectl','flush-caches') == 0 or exit 10; } elsif (-x '/usr/sbin/nscd') { system('/usr/sbin/nscd','-i','hosts') == 0 or exit 10; } else { exit 10; }"
  if (Buffer.byteLength(perl + flush) > 60000) throw new Error('Hosts is too large for a safe inline administrator command. Existing hosts were left unchanged.')
  if (platform === 'linux') return { file: '/usr/bin/pkexec', args: ['/usr/bin/perl', '-e', perl + flush] }
  const command = '/usr/bin/perl -e ' + shellQuote(perl + flush)
  return { file: '/usr/bin/osascript', args: ['-e', 'do shell script ' + JSON.stringify(command) + ' with administrator privileges'] }
}
export class SystemHosts {
  async read(): Promise<string> { return readSystemHosts() }
  async set(domain: string, enabled: boolean): Promise<string | null> {
    const before = await this.read()
    const next = patchManagedHosts(before, domain, enabled)
    return this.apply(before, next, (after) => managedHostDomains(after).includes(domain) === enabled)
  }
  async removeAll(): Promise<string | null> {
    const before = await this.read()
    const next = managedHostDomains(before).reduce((text, domain) => patchManagedHosts(text, domain, false), before)
    return this.apply(before, next, (after) => managedHostDomains(after).length === 0)
  }
  private async apply(before: string, next: string, verified: (after: string) => boolean): Promise<string | null> {
    if (before === next) return null
    const command = buildHostsCommand(process.platform, Buffer.from(before, 'latin1'), Buffer.from(next, 'latin1'))
    let warning: string | null = null
    try {
      await execute(command.file, command.args, { windowsHide: true, timeout: 70000, maxBuffer: 64 * 1024 })
    } catch (error) {
      const code = (error as { code?: unknown }).code
      const after = await this.read()
      if (!verified(after)) throw new Error('The hosts change was not completed. Authorization may have been cancelled, or hosts changed. Refresh and retry.')
      warning = code === 10
        ? 'Hosts updated, but the OS DNS cache could not be flushed. Close old browser tabs and restart the browser if it still uses the previous address.'
        : 'The hosts result was verified, but the privileged helper did not complete normally. Refresh before continuing.'
    }
    if (!verified(await this.read())) throw new Error('The hosts change could not be verified. Refresh before continuing.')
    return warning
  }
}
