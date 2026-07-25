import { BrowserWindow, dialog, ipcMain } from 'electron'
import type {
  ImportPlainInput,
  SaveDocumentInput
} from '../../shared/secret-box/io-types'
import type { AccessInput, DocType, SetupInput } from '../../shared/privatebox/types'
import * as exportImport from '../secret-box/export-import'
import * as fsOps from './fs-ops'
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
  setupVault
} from './vault'

export function registerPrivateBoxIpc(): void {
  ipcMain.handle('privateBox:getStatus', async () => {
    await ensureDefaultSecretBox()
    return getStatus()
  })

  ipcMain.handle('privateBox:ensureDefault', async () => ensureDefaultSecretBox())

  ipcMain.handle('privateBox:pickEmptyFolder', async (event) => {
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

  ipcMain.handle('privateBox:pickVaultFolder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null
    await openExistingVaultPath(result.filePaths[0])
    return result.filePaths[0]
  })

  ipcMain.handle('privateBox:setup', async (_e, input: SetupInput) => {
    await setupVault(input)
  })

  ipcMain.handle('privateBox:access', async (_e, input: AccessInput) => {
    await accessVault(input)
  })

  ipcMain.handle('privateBox:clearAccess', async () => {
    clearVaultAccess()
  })

  ipcMain.handle('privateBox:setActive', async (_e, id: string) => {
    await setActiveVault(id)
  })

  ipcMain.handle('privateBox:removeFromList', async (_e, id: string) => {
    await removeVaultFromList(id)
  })

  ipcMain.handle(
    'privateBox:renameVault',
    async (_e, payload: { id: string; name: string }) => {
      await renameVault(payload.id, payload.name)
    }
  )

  ipcMain.handle('privateBox:list', async (_e, relativePath: string) => {
    return fsOps.listDir(relativePath || '')
  })

  ipcMain.handle('privateBox:listFolders', async () => {
    return fsOps.listFoldersRecursive('')
  })

  ipcMain.handle('privateBox:mkdir', async (_e, relativePath: string) => {
    await fsOps.mkdirPath(relativePath)
  })

  ipcMain.handle(
    'privateBox:createFile',
    async (
      _e,
      payload: { relativeDir: string; name: string; type: DocType }
    ) => {
      return fsOps.createFile(payload.relativeDir, payload.name, payload.type)
    }
  )

  ipcMain.handle('privateBox:readFile', async (_e, relativePath: string) => {
    return fsOps.readDoc(relativePath)
  })

  ipcMain.handle(
    'privateBox:writeFile',
    async (_e, payload: { relativePath: string; content: string }) => {
      return fsOps.writeDoc(payload.relativePath, payload.content)
    }
  )

  ipcMain.handle(
    'privateBox:rename',
    async (_e, payload: { relativePath: string; newName: string }) => {
      return fsOps.renameEntry(payload.relativePath, payload.newName)
    }
  )

  ipcMain.handle('privateBox:remove', async (_e, relativePath: string) => {
    await fsOps.removeEntry(relativePath)
  })

  ipcMain.handle('privateBox:exportPlain', async (_e, relativePath: string) => {
    return exportImport.exportDocPlain(relativePath)
  })

  ipcMain.handle('privateBox:exportToDisk', async (event, relativePath: string) => {
    return exportImport.exportDocToDisk(relativePath, event.sender)
  })

  ipcMain.handle('privateBox:importPlain', async (_e, input: ImportPlainInput) => {
    return exportImport.importPlainToActiveBox(input)
  })

  ipcMain.handle(
    'privateBox:importFromDisk',
    async (event, relativeDir?: string) => {
      return exportImport.importPlainFromDisk(event.sender, relativeDir || '')
    }
  )

  ipcMain.handle('privateBox:saveDocument', async (_e, input: SaveDocumentInput) => {
    return exportImport.saveDocument(input)
  })

  ipcMain.handle('privateBox:prepareDefaultForSave', async () => {
    return exportImport.prepareDefaultBoxForSave()
  })

  ipcMain.handle('privateBox:accessDefault', async (_e, keyB: string) => {
    await exportImport.accessDefaultBox(keyB)
  })
}
