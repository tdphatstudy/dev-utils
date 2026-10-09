import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { KeygenRequest } from '@shared/crypto/keygen-types'
import type {
  SshConnectRequest,
  SshHostInput,
  SshKeyCreateInput,
  SshKeyRenameInput,
  SshLocation
} from '@shared/ssh/types'
import { generateKeyPair } from '../crypto-keys'
import { assertTrustedIpc } from '../ipc-trust'
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
import { IpcTaskPool } from '../ipc-task-pool'

const tasks = new IpcTaskPool(4, 'Too many SSH operations are running. Wait for completion and retry.')
const keyGeneration = new IpcTaskPool(1, 'Key generation is already running. Wait for completion.')

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid SSH request.')
  return value as Record<string, unknown>
}
function checkString(value: unknown, label: string): void {
  if (typeof value !== 'string' || !value.trim() || value.length > 4096 || /[\x00-\x1f\x7f]/.test(value)) throw new Error(`Invalid ${label}.`)
}
function checkLocation(value: unknown): void {
  if (value == null) return
  const location = record(value)
  for (const field of ['sshDir', 'configPath']) if (location[field] != null && location[field] !== '') checkString(location[field], field)
}
function handleSsh<T>(channel: string, listener: (event: IpcMainInvokeEvent, payload: T) => unknown): void {
  ipcMain.handle(channel, async (event, payload: T) => {
    assertTrustedIpc(event)
    if (['ssh:list', 'ssh:resolvePaths', 'ssh:openFolder'].includes(channel)) checkLocation(payload)
    else if (!['ssh:pickFolder', 'ssh:pickConfigFile'].includes(channel)) {
      const request = record(payload)
      checkLocation(request.location)
      if (['ssh:readPublic', 'ssh:deleteKey', 'ssh:renameKey'].includes(channel)) checkString(request.path, 'key path')
      if (channel === 'ssh:deleteHost') checkString(request.alias, 'host alias')
      if (channel === 'ssh:renameKey') checkString(request.newName, 'key name')
      if (channel === 'ssh:createKey') {
        checkString(request.name, 'key name')
        if (!['ed25519', 'rsa'].includes(request.algorithm as string) || (request.overwrite !== undefined && typeof request.overwrite !== 'boolean')) throw new Error('Invalid key generation options.')
      }
    }
    return tasks.run(() => channel === 'ssh:createKey' ? keyGeneration.run(() => listener(event, payload)) : listener(event, payload))
  })
}

export function registerCryptoAndSshIpc(): void {
  ipcMain.handle('crypto:generateKeyPair', async (event, req: KeygenRequest) => {
    assertTrustedIpc(event)
    return keyGeneration.run(() => generateKeyPair(req))
  })

  handleSsh('ssh:list', async (_e, location?: SshLocation | null) =>
    listSshInventory(location ?? null)
  )

  handleSsh('ssh:resolvePaths', (_e, location?: SshLocation | null) =>
    resolveSshPaths(location ?? null)
  )

  handleSsh(
    'ssh:readPublic',
    async (_e, payload: { path: string; location?: SshLocation | null }) =>
      sshReadPublic(payload.path, payload.location ?? null)
  )

  handleSsh('ssh:testConnect', async (_e, req: SshConnectRequest) => {
    return sshTestConnect(req)
  })

  handleSsh('ssh:openFolder', async (_e, location?: SshLocation | null) =>
    sshOpenFolder(location ?? null)
  )

  handleSsh('ssh:pickFolder', async (event) => sshPickFolder(event.sender))

  handleSsh('ssh:pickConfigFile', async (event) => sshPickConfigFile(event.sender))

  handleSsh(
    'ssh:upsertHost',
    async (_e, payload: SshHostInput & { location?: SshLocation | null }) => {
      const { location, ...input } = payload
      return upsertHost(input, location ?? null)
    }
  )

  handleSsh(
    'ssh:deleteHost',
    async (_e, payload: { alias: string; location?: SshLocation | null }) => {
      await deleteHost(payload.alias, payload.location ?? null)
    }
  )

  handleSsh(
    'ssh:createKey',
    async (_e, payload: SshKeyCreateInput & { location?: SshLocation | null }) => {
      const { location, ...input } = payload
      return createSshKey(input, location ?? null)
    }
  )

  handleSsh(
    'ssh:deleteKey',
    async (_e, payload: { path: string; location?: SshLocation | null }) => {
      return deleteSshKey(payload.path, payload.location ?? null)
    }
  )

  handleSsh(
    'ssh:renameKey',
    async (_e, payload: SshKeyRenameInput & { location?: SshLocation | null }) => {
      const { location, ...input } = payload
      return renameSshKey(input, location ?? null)
    }
  )
}
