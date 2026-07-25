import { app, safeStorage } from 'electron'
import { existsSync } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { deviceSecretPath, userDataRoot } from './paths'
import { generateDeviceSecret } from './crypto'

export async function loadOrCreateDeviceSecret(): Promise<string> {
  const file = deviceSecretPath()
  await mkdir(userDataRoot(), { recursive: true })

  if (existsSync(file)) {
    const raw = await readFile(file)
    if (safeStorage.isEncryptionAvailable()) {
      try {
        return safeStorage.decryptString(raw)
      } catch {
        /* recreate */
      }
    } else {
      return raw.toString('utf8')
    }
  }

  const secret = generateDeviceSecret()
  if (safeStorage.isEncryptionAvailable()) {
    await writeFile(file, safeStorage.encryptString(secret))
  } else {
    await writeFile(file, secret, 'utf8')
  }
  return secret
}
