import { app, safeStorage } from 'electron'
import { existsSync } from 'fs'
import { readFile, mkdir, writeFile } from 'fs/promises'
import { authError } from './crypto'
import { resolveHardwareDeviceSecret } from './machine-id'
import { deviceSecretPath, userDataRoot } from './paths'

export type DeviceKeySource = 'hardware' | 'legacy-file'

export interface DeviceKeyCandidate {
  source: DeviceKeySource
  keyA: string
}

/**
 * Device-mode key A candidates for access (order):
 * 1. Legacy userData secret (if readable) — vaults created by older builds
 * 2. Hardware fingerprint — survives OS reinstall on the same machine
 *
 * Never silent-rotate a corrupt legacy file into a new random key.
 */
export async function listDeviceKeyCandidates(): Promise<DeviceKeyCandidate[]> {
  const out: DeviceKeyCandidate[] = []
  let legacyFatal: Error | null = null

  try {
    const legacy = await tryLoadLegacyDeviceSecret()
    if (legacy) out.push({ source: 'legacy-file', keyA: legacy })
  } catch (e) {
    if (e instanceof Error && e.name === 'DEVICE_SECRET_UNREADABLE') {
      legacyFatal = e
    }
  }

  try {
    const keyA = await resolveHardwareDeviceSecret()
    out.push({ source: 'hardware', keyA })
  } catch {
    /* HW unavailable */
  }

  const seen = new Set<string>()
  const unique: DeviceKeyCandidate[] = []
  for (const c of out) {
    if (seen.has(c.keyA)) continue
    seen.add(c.keyA)
    unique.push(c)
  }

  if (unique.length === 0) {
    if (legacyFatal) throw legacyFatal
    throw authError(
      'DEVICE_KEY_UNAVAILABLE',
      'No device key available: hardware id unreadable and no usable legacy device secret. Use portable mode, or restore device-secret from backup.'
    )
  }

  return unique
}

/**
 * New device-mode vaults: always prefer hardware so reinstalling the OS
 * on the same PC still unlocks. Legacy file only if hardware fails.
 */
export async function resolveDeviceKeyAForSetup(): Promise<string> {
  try {
    const keyA = await resolveHardwareDeviceSecret()
    void cacheDeviceSecretHint(keyA)
    return keyA
  } catch (hwErr) {
    try {
      const legacy = await tryLoadLegacyDeviceSecret()
      if (legacy) return legacy
    } catch {
      /* fall through */
    }
    throw hwErr
  }
}

/** @deprecated alias for setup / ensureDefault */
export async function loadOrCreateDeviceSecret(): Promise<string> {
  return resolveDeviceKeyAForSetup()
}

export async function resolveDeviceKeyA(): Promise<string> {
  const list = await listDeviceKeyCandidates()
  return list[0]!.keyA
}

async function tryLoadLegacyDeviceSecret(): Promise<string | null> {
  const file = deviceSecretPath()
  if (!existsSync(file)) return null

  let raw: Buffer
  try {
    raw = await readFile(file)
  } catch {
    throw authError(
      'DEVICE_SECRET_UNREADABLE',
      'Device secret file exists but cannot be read. Do not delete it — restore from backup if possible.'
    )
  }

  if (raw.length === 0) {
    throw authError(
      'DEVICE_SECRET_UNREADABLE',
      'Device secret file is empty. Without a readable hardware id, older device vaults may be unrecoverable.'
    )
  }

  try {
    if (typeof safeStorage !== 'undefined' && safeStorage.isEncryptionAvailable?.()) {
      return safeStorage.decryptString(raw)
    }
    return raw.toString('utf8')
  } catch {
    throw authError(
      'DEVICE_SECRET_UNREADABLE',
      'Legacy device secret cannot be decrypted (OS credentials changed). Hardware-bound vaults on this machine still work if the board/CPU id is readable.'
    )
  }
}

export async function cacheDeviceSecretHint(secret: string): Promise<void> {
  try {
    if (!app?.isReady?.() || !safeStorage?.isEncryptionAvailable?.()) return
    await mkdir(userDataRoot(), { recursive: true })
    await writeFile(deviceSecretPath(), safeStorage.encryptString(secret))
  } catch {
    /* best-effort */
  }
}
