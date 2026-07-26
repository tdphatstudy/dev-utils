import { createHash } from 'crypto'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { authError } from './crypto'

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

/** Parse `wmic X get Y` table output → values under header. */
function parseWmic(stdout: string, header: string): string[] {
  const lines = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const out: string[] = []
  for (const line of lines) {
    if (line.toLowerCase() === header.toLowerCase()) continue
    if (isUseful(line)) out.push(line)
  }
  return out
}

async function windowsIds(): Promise<string[]> {
  const parts: string[] = []
  const uuidOut = await run('wmic', ['csproduct', 'get', 'uuid'])
  parts.push(...parseWmic(uuidOut, 'UUID'))
  const board = await run('wmic', ['baseboard', 'get', 'serialnumber'])
  parts.push(...parseWmic(board, 'SerialNumber'))
  const bios = await run('wmic', ['bios', 'get', 'serialnumber'])
  parts.push(...parseWmic(bios, 'SerialNumber'))
  const cpu = await run('wmic', ['cpu', 'get', 'processorid'])
  parts.push(...parseWmic(cpu, 'ProcessorId'))
  return parts
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

/**
 * Stable machine fingerprint parts (motherboard / product UUID / CPU id, etc.).
 * Same hardware → same parts after OS reinstall (when firmware tables survive).
 */
export async function collectMachineIdParts(): Promise<string[]> {
  if (process.platform === 'win32') return windowsIds()
  if (process.platform === 'darwin') return darwinIds()
  return linuxIds()
}

export function fingerprintFromParts(parts: string[]): string {
  const normalized = [...new Set(parts.map(clean).filter(isUseful))].sort().join('\n')
  return createHash('sha256').update(normalized, 'utf8').digest('hex')
}

/**
 * keyA material for device-mode vaults — deterministic from hardware.
 * Survives app reinstall / OS reinstall on the same machine; fails on different PC.
 */
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
