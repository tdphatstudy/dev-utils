import { existsSync } from 'fs'
import { shell, dialog, BrowserWindow } from 'electron'
import type { SshConnectRequest, SshListResult, SshLocation } from '@shared/ssh/types'
import { resolveSshPaths, getSshDir } from './paths'
import { listSshKeys, mergeExternalIdentityKeys, readPublicKeySafe } from './list-keys'
import { testTcpConnect } from './connect-test'
import {
  createSshKey,
  deleteHost,
  deleteSshKey,
  listHostsFromConfig,
  renameSshKey,
  upsertHost
} from './crud'

export async function listSshInventory(
  location?: SshLocation | null
): Promise<SshListResult> {
  const paths = resolveSshPaths(location)
  const exists = existsSync(paths.sshDir)
  let keys = exists ? await listSshKeys(location) : []
  const hosts = exists || existsSync(paths.configPath) ? await listHostsFromConfig(location) : []

  const identityFiles = hosts
    .flatMap((h) => h.identityFiles ?? [h.identityFile])
    .filter((x): x is string => !!x)
  keys = await mergeExternalIdentityKeys(keys, identityFiles, location)

  return {
    sshDir: paths.sshDir,
    configPath: paths.configPath,
    defaultSshDir: paths.defaultSshDir,
    defaultConfigPath: paths.defaultConfigPath,
    usingCustomLocation: paths.usingCustomLocation,
    exists: exists || existsSync(paths.configPath),
    keys,
    hosts
  }
}

export async function sshReadPublic(
  path: string,
  location?: SshLocation | null
): Promise<string> {
  return readPublicKeySafe(path, location)
}

export async function sshTestConnect(req: SshConnectRequest) {
  return testTcpConnect(req)
}

export async function sshOpenFolder(location?: SshLocation | null): Promise<string> {
  const dir = getSshDir(location)
  const error = await shell.openPath(dir)
  if (error) throw new Error(`Could not open SSH directory “${dir}”: ${error}`)
  return dir
}

export async function sshPickFolder(
  sender: Electron.WebContents
): Promise<string | null> {
  const win = BrowserWindow.fromWebContents(sender)
  const result = await dialog.showOpenDialog(win!, {
    properties: ['openDirectory'],
    title: 'Select SSH directory (keys + config)'
  })
  if (result.canceled || !result.filePaths[0]) return null
  return result.filePaths[0]
}

export async function sshPickConfigFile(
  sender: Electron.WebContents
): Promise<string | null> {
  const win = BrowserWindow.fromWebContents(sender)
  const result = await dialog.showOpenDialog(win!, {
    properties: ['openFile'],
    title: 'Select SSH config file',
    filters: [
      { name: 'SSH config', extensions: ['*'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  if (result.canceled || !result.filePaths[0]) return null
  return result.filePaths[0]
}

export {
  upsertHost,
  deleteHost,
  createSshKey,
  deleteSshKey,
  renameSshKey
}
export { assertInsideSshRoot, getSshDir, resolveSshPaths, getDefaultSshDir } from './paths'
export { parseSshConfig, rewriteSshConfig, serializeHostBlock } from './parse-config'
