import { app } from 'electron'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { APP_ID, APP_NAME } from '@shared/brand'

export function legacyDataPath(appData: string, packaged: boolean, exists = existsSync): string {
  const names = packaged ? ['DevUtils', 'devutils'] : ['devutils', 'DevUtils']
  return names.map((name) => join(appData, name)).find(exists) ?? join(appData, names[0])
}

/** Rename the UI without silently moving vaults, device secrets or Chromium storage. */
export function configureBrand(): void {
  const storage = legacyDataPath(app.getPath('appData'), app.isPackaged)
  mkdirSync(storage, { recursive: true })
  app.setPath('userData', storage)
  app.setPath('sessionData', storage)
  app.setName(APP_NAME)
  if (process.platform === 'win32') app.setAppUserModelId(APP_ID)
  if (process.platform === 'linux') app.setDesktopName(`${APP_ID}.desktop`)
}

export function resourcePath(name: string): string | undefined {
  return [join(process.resourcesPath, name), join(app.getAppPath(), 'resources', name), join(__dirname, '../../resources', name)].find(existsSync)
}

/** Every visible native window uses the same installed product icon. */
export function appWindowIcon(): string | undefined {
  return resourcePath(process.platform === 'win32' ? 'icon.ico' : 'icon.png')
}
