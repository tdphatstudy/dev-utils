import { createHash } from 'crypto'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { authError } from './crypto'
import { collectWindowsMachineIdParts } from '../platform/windows-machine-id'

const execFileAsync = promisify(execFile)

const GENERIC = new Set([
  '',
  'none',
  'to be filled by o.e.m.',
  'to be filled by oem',
  'default string',
  'system serial number',
  'system product name',
  'system manufacturer',
  'chassis serial number',
  '0',
  '00000000-0000-0000-0000-000000000000',
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
  'not specified',
  'not applicable'
])

function clean(s: string | undefined | null): string {
  return (s ?? '').replace(/\0/g, '').trim()
}

function isUseful(s: string): boolean {
  const t = s.toLowerCase()
  if (!t || GENERIC.has(t)) return false
  if (/^0+$/.test(t.replace(/[-\s]/g, ''))) return false
  return true
}

async function run(
  cmd: string,
  args: string[],
  timeoutMs = 4000
): Promise<string> {
  try {
    const { stdout } = await execFileAsync(cmd, args, {
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 256 * 1024
    })
    return stdout || ''
  } catch {
    return ''
  }
}

async function darwinIds(): Promise<string[]> {
  const out = await run('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'])
  const m = /"IOPlatformUUID"\s*=\s*"([^"]+)"/.exec(out)
  return m?.[1] && isUseful(m[1]) ? [m[1]] : []
}

async function linuxIds(): Promise<string[]> {
  const parts: string[] = []
  const files = [
    '/sys/class/dmi/id/product_uuid',
    '/sys/class/dmi/id/board_serial',
    '/sys/class/dmi/id/product_serial',
    '/etc/machine-id'
  ]
  for (const f of files) {
    if (!existsSync(f)) continue
    try {
      const v = clean(await readFile(f, 'utf8'))
      if (isUseful(v)) parts.push(v)
    } catch {
      /* permission */
    }
  }
  return parts
}

export async function collectMachineIdParts(): Promise<string[]> {
  if (process.platform === 'win32') return collectWindowsMachineIdParts(run, isUseful)
  if (process.platform === 'darwin') return darwinIds()
  return linuxIds()
}

export function fingerprintFromParts(parts: string[]): string {
  const normalized = [...new Set(parts.map(clean).filter(isUseful))].sort().join('\n')
  if (!normalized) return ''
  return createHash('sha256').update(normalized, 'utf8').digest('hex')
}

export function deriveDeviceSecretFromFingerprint(fingerprintHex: string): string {
  return createHash('sha256')
    .update(`devutils-device-key-v1\0${fingerprintHex}`, 'utf8')
    .digest('base64')
}

export async function resolveHardwareDeviceSecret(): Promise<string> {
  const parts = await collectMachineIdParts()
  if (parts.length === 0) {
    throw authError(
      'DEVICE_FINGERPRINT_UNAVAILABLE',
      'Could not read machine hardware id (board/CPU/UUID). Device-mode vaults need a stable machine id. Use portable mode with two keys, or check OS permissions.'
    )
  }
  const fp = fingerprintFromParts(parts)
  if (!fp || fp.length < 32) {
    throw authError(
      'DEVICE_FINGERPRINT_UNAVAILABLE',
      'Hardware fingerprint was empty or generic. Use portable mode instead.'
    )
  }
  return deriveDeviceSecretFromFingerprint(fp)
}
