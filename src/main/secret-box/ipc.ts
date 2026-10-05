import { BrowserWindow, dialog, ipcMain } from 'electron'
import type {
  ImportPlainInput,
  SaveDocumentInput
} from '@shared/secret-box/io-types'
import type { AccessInput, DocType, SetupInput, RecoverMetadataInput } from '@shared/secret-box/types'
import * as exportImport from './export-import'
import * as fsOps from './fs-ops'
import { assertTrustedIpc } from '../ipc-trust'
import { CONTENT_KIND_IDS } from '@shared/secret-box/content-kinds'
import { assertSessionId, bindSessionOwner, getSessionId } from './session'
import { KEEP_FOLDER } from '@shared/secret-box/keep-note'

import {
  accessVault,
  clearVaultAccess,
  ensureDefaultSecretBox,
  getStatus,
  isDirectoryEmpty,
  openExistingVaultPath,
  removeVaultFromList,
  renameVault,
  setActiveVault,
  setupVault,
  recoverVaultMetadata
} from './vault'

const dataChannels = new Set(['privateBox:list', 'privateBox:listFolders', 'privateBox:mkdir', 'privateBox:createFile', 'privateBox:readFile', 'privateBox:writeFile', 'privateBox:rename', 'privateBox:remove', 'privateBox:exportPlain', 'privateBox:exportToDisk', 'privateBox:importPlain', 'privateBox:importFromDisk', 'privateBox:saveDocument', 'privateBox:listKeepNotes'])
const authChannels = new Set(['privateBox:access', 'privateBox:accessDefault', 'privateBox:setup', 'privateBox:recoverMetadata'])
let authenticating = false

function validateBoxPayload(channel: string, value: unknown): void {
  const text = (input: unknown, label: string, max = 4096): void => {
    if (typeof input !== 'string' || input.length > max || (!['content', 'keyA', 'keyB', 'password'].includes(label) && /[\x00-\x1f\x7f]/.test(input))) throw new Error(`Invalid ${label}.`)
  }
  if (['privateBox:getStatus', 'privateBox:ensureDefault', 'privateBox:pickEmptyFolder', 'privateBox:pickVaultFolder', 'privateBox:clearAccess', 'privateBox:prepareDefaultForSave'].includes(channel)) return
  if (['privateBox:setActive', 'privateBox:removeFromList'].includes(channel)) { text(value, 'box id'); return }
  if (channel === 'privateBox:accessDefault') { text(value, 'password', 8192); return }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid box request.')
  const request = value as Record<string, unknown>
  if (dataChannels.has(channel)) {
    text(request.sessionId, 'session id', 64)
    if (!request.sessionId) throw new Error('Invalid session id.')
  }
  if (['privateBox:list', 'privateBox:mkdir', 'privateBox:readFile', 'privateBox:remove', 'privateBox:exportPlain', 'privateBox:exportToDisk'].includes(channel)) { text(request.relativePath, 'path'); return }
  if (channel === 'privateBox:listKeepNotes' && request.cursor !== undefined) text(request.cursor, 'cursor')
  const required: Record<string, string[]> = {
    'privateBox:setup': ['rootPath', 'keyA', 'keyB'], 'privateBox:access': ['keyB'], 'privateBox:recoverMetadata': ['boxId', 'keyB'],
    'privateBox:renameVault': ['id', 'name'], 'privateBox:createFile': ['relativeDir', 'name'],
    'privateBox:writeFile': ['relativePath', 'content'], 'privateBox:rename': ['relativePath', 'newName'],
    'privateBox:saveDocument': ['name', 'content'], 'privateBox:importPlain': ['name', 'content']
  }
  for (const field of required[channel] ?? []) text(request[field], field, field === 'content' ? 64 * 1024 * 1024 : field.startsWith('key') ? 8192 : 4096)
  for (const field of ['relativeDir', 'mimeType', 'keyA', 'name', 'boxId']) if (request[field] !== undefined) text(request[field], field, field === 'keyA' ? 8192 : 4096)
  if (channel === 'privateBox:setup' && (request.mode !== 'device' && request.mode !== 'portable' || !String(request.rootPath).trim())) throw new Error('Invalid box setup options.')
  if (['privateBox:createFile', 'privateBox:saveDocument'].includes(channel) || request.type !== undefined) {
    if (!CONTENT_KIND_IDS.includes(request.type as DocType)) throw new Error('Invalid document type.')
  }
  if (request.encoding !== undefined && request.encoding !== 'utf-8' && request.encoding !== 'base64') throw new Error('Invalid document encoding.')
}

function handleBox(channel: string, listener: Parameters<typeof ipcMain.handle>[1]): void {
  ipcMain.handle(channel, async (event, payload: unknown) => {
    assertTrustedIpc(event)
    validateBoxPayload(channel, payload)
    const token = (payload as { sessionId?: string } | undefined)?.sessionId
    if (dataChannels.has(channel)) assertSessionId(token, event.sender.id)
    const auth = authChannels.has(channel)
    if (auth && authenticating) throw new Error('Authentication is already running. Wait for completion or cancel it.')
    if (auth) authenticating = true
    try {
      const result = await listener(event, payload)
      if (dataChannels.has(channel)) assertSessionId(token, event.sender.id)
      if (auth) bindSessionOwner(event.sender.id)
      return ['privateBox:access', 'privateBox:accessDefault'].includes(channel) ? getSessionId() : result
    } finally { if (auth) authenticating = false }
  })
}

export function registerSecretBoxIpc(): void {
  handleBox('privateBox:getStatus', async () => {
    try { await ensureDefaultSecretBox() }
    catch (e) {
      // An unavailable default/device key must not hide other portable boxes.
      return { ...await getStatus(), initializationError: e instanceof Error ? e.message : 'Could not initialize Default Secret Box.' }
    }
    return getStatus()
  })

  handleBox('privateBox:ensureDefault', async () => ensureDefaultSecretBox())

  handleBox('privateBox:pickEmptyFolder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null
    const path = result.filePaths[0]
    const empty = await isDirectoryEmpty(path)
    if (!empty) throw new Error('Folder must be empty (except system junk files)')
    return path
  })

  handleBox('privateBox:pickVaultFolder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null
    await openExistingVaultPath(result.filePaths[0])
    return result.filePaths[0]
  })

  handleBox('privateBox:setup', async (_e, input: SetupInput) => {
    await setupVault(input)
  })

  handleBox('privateBox:access', async (_e, input: AccessInput) => {
    await accessVault(input)
  })

  handleBox('privateBox:recoverMetadata', async (_e, input: RecoverMetadataInput) => recoverVaultMetadata(input))

  handleBox('privateBox:clearAccess', async () => {
    clearVaultAccess()
  })

  handleBox('privateBox:setActive', async (_e, id: string) => {
    await setActiveVault(id)
  })

  handleBox('privateBox:removeFromList', async (_e, id: string) => {
    await removeVaultFromList(id)
  })

  handleBox(
    'privateBox:renameVault',
    async (_e, payload: { id: string; name: string }) => {
      await renameVault(payload.id, payload.name)
    }
  )

  handleBox('privateBox:list', async (_e, payload: { relativePath: string }) => {
    return fsOps.listDir(payload.relativePath)
  })

  handleBox('privateBox:listFolders', async () => {
    return fsOps.listFoldersRecursive('')
  })

  handleBox('privateBox:mkdir', async (_e, payload: { relativePath: string }) => {
    await fsOps.mkdirPath(payload.relativePath)
  })

  handleBox(
    'privateBox:createFile',
    async (
      _e,
      payload: { relativeDir: string; name: string; type: DocType }
    ) => {
      return fsOps.createFile(payload.relativeDir, payload.name, payload.type)
    }
  )

  handleBox('privateBox:readFile', async (_e, payload: { relativePath: string }) => {
    return fsOps.readDoc(payload.relativePath)
  })

  handleBox(
    'privateBox:writeFile',
    async (_e, payload: { relativePath: string; content: string }) => {
      return fsOps.writeDoc(payload.relativePath, payload.content)
    }
  )

  handleBox(
    'privateBox:rename',
    async (_e, payload: { relativePath: string; newName: string }) => {
      return fsOps.renameEntry(payload.relativePath, payload.newName)
    }
  )

  handleBox('privateBox:remove', async (_e, payload: { relativePath: string }) => {
    await fsOps.removeEntry(payload.relativePath)
  })

  handleBox('privateBox:exportPlain', async (_e, payload: { relativePath: string }) => {
    return exportImport.exportDocPlain(payload.relativePath)
  })

  handleBox('privateBox:exportToDisk', async (event, payload: { relativePath: string }) => {
    return exportImport.exportDocToDisk(payload.relativePath, event.sender)
  })

  handleBox('privateBox:importPlain', async (_e, input: ImportPlainInput) => {
    return exportImport.importPlainToActiveBox(input)
  })

  handleBox(
    'privateBox:importFromDisk',
    async (event, payload: { relativeDir?: string }) => {
      return exportImport.importPlainFromDisk(event.sender, payload.relativeDir || '')
    }
  )

  handleBox('privateBox:saveDocument', async (_e, input: SaveDocumentInput) => {
    return exportImport.saveDocument(input)
  })

  handleBox('privateBox:prepareDefaultForSave', async () => {
    return exportImport.prepareDefaultBoxForSave()
  })

  handleBox('privateBox:accessDefault', async (_e, keyB: string) => {
    await exportImport.accessDefaultBox(keyB)
  })
  handleBox('privateBox:listKeepNotes', async (_e, payload: { cursor?: string }) => fsOps.listKeepNotes(KEEP_FOLDER, payload.cursor))
}

/** @deprecated use registerSecretBoxIpc */
export const registerPrivateBoxIpc = registerSecretBoxIpc
