import { ipcMain } from 'electron'
import type { KeygenRequest } from '@shared/crypto/keygen-types'
import type {
  SshConnectRequest,
  SshHostInput,
  SshKeyCreateInput,
  SshKeyRenameInput,
  SshLocation
} from '@shared/ssh/types'
import { generateKeyPair } from '../crypto-keys'
import {
  createSshKey,
  deleteHost,
  deleteSshKey,
  listSshInventory,
  renameSshKey,
  sshOpenFolder,
  sshPickConfigFile,
  sshPickFolder,
  sshReadPublic,
  sshTestConnect,
  upsertHost
} from './index'
import { resolveSshPaths } from './paths'

export function registerCryptoAndSshIpc(): void {
  ipcMain.handle('crypto:generateKeyPair', (_e, req: KeygenRequest) => {
    return generateKeyPair(req)
  })

  ipcMain.handle('ssh:list', async (_e, location?: SshLocation | null) =>
    listSshInventory(location ?? null)
  )

  ipcMain.handle('ssh:resolvePaths', (_e, location?: SshLocation | null) =>
    resolveSshPaths(location ?? null)
  )

  ipcMain.handle(
    'ssh:readPublic',
    async (_e, payload: { path: string; location?: SshLocation | null }) =>
      sshReadPublic(payload.path, payload.location ?? null)
  )

  ipcMain.handle('ssh:testConnect', async (_e, req: SshConnectRequest) => {
    return sshTestConnect(req)
  })

  ipcMain.handle('ssh:openFolder', async (_e, location?: SshLocation | null) =>
    sshOpenFolder(location ?? null)
  )

  ipcMain.handle('ssh:pickFolder', async (event) => sshPickFolder(event.sender))

  ipcMain.handle('ssh:pickConfigFile', async (event) => sshPickConfigFile(event.sender))

  ipcMain.handle(
    'ssh:upsertHost',
    async (_e, payload: SshHostInput & { location?: SshLocation | null }) => {
      const { location, ...input } = payload
      return upsertHost(input, location ?? null)
    }
  )

  ipcMain.handle(
    'ssh:deleteHost',
    async (_e, payload: { alias: string; location?: SshLocation | null }) => {
      await deleteHost(payload.alias, payload.location ?? null)
    }
  )

  ipcMain.handle(
    'ssh:createKey',
    async (_e, payload: SshKeyCreateInput & { location?: SshLocation | null }) => {
      const { location, ...input } = payload
      return createSshKey(input, location ?? null)
    }
  )

  ipcMain.handle(
    'ssh:deleteKey',
    async (_e, payload: { path: string; location?: SshLocation | null }) => {
      await deleteSshKey(payload.path, payload.location ?? null)
    }
  )

  ipcMain.handle(
    'ssh:renameKey',
    async (_e, payload: SshKeyRenameInput & { location?: SshLocation | null }) => {
      const { location, ...input } = payload
      return renameSshKey(input, location ?? null)
    }
  )
}
