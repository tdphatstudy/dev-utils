import { BrowserWindow, dialog } from 'electron'
import { writeFile } from 'fs/promises'
import { basename, resolve } from 'path'
import type {
  ExportPlainResult,
  ImportPlainInput,
  SaveDocumentInput,
  SaveDocumentResult
} from '@shared/secret-box/io-types'
import {
  getContentKind,
  isBinaryKind,
  mimeFromFileName
} from '@shared/secret-box/content-kinds'
import type { DocType } from '@shared/secret-box/types'
import { ensureExtension, MAX_MEDIA_BYTES, typeFromName } from '@shared/secret-box/types'
import { MAX_TEXT_IMPORT_BYTES } from '@shared/secret-box/limits'
import { readBoundedFile } from '../bounded-read'
import * as fsOps from './fs-ops'
import { getAccess, requireAccess, assertAccess, getAccessRevision, assertAccessRevision, getSessionId } from './session'
import {
  accessVault,
  ensureDefaultSecretBox,
  getActiveEntry,
  getDefaultVaultEntry,
  readVaultConfig,
  setActiveVault
} from './vault'

export async function exportDocPlain(relativePath: string): Promise<ExportPlainResult> {
  const access = requireAccess()
  const doc = await fsOps.readDoc(relativePath)
  assertAccess(access)
  return {
    name: doc.name,
    type: doc.type,
    content: doc.content,
    relativePath: doc.relativePath,
    encoding: doc.encoding,
    mimeType: doc.mimeType
  }
}

export async function exportDocToDisk(
  relativePath: string,
  sender: Electron.WebContents
): Promise<string | null> {
  const access = requireAccess()
  const plain = await exportDocPlain(relativePath)
  assertAccess(access)
  const win = BrowserWindow.fromWebContents(sender)
  const kind = getContentKind(plain.type)
  const result = await dialog.showSaveDialog(win!, {
    defaultPath: plain.name,
    filters: [
      { name: kind.label, extensions: kind.extensions.map((e) => e.replace(/^\./, '')) },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  if (result.canceled || !result.filePath) return null
  assertAccess(access)

  if (plain.encoding === 'base64' || isBinaryKind(plain.type)) {
    const buf = Buffer.from(plain.content, 'base64')
    await writeFile(result.filePath, buf)
  } else {
    await writeFile(result.filePath, plain.content, 'utf8')
  }
  return result.filePath
}

export async function importPlainToActiveBox(
  input: ImportPlainInput
): Promise<ExportPlainResult & { relativePath: string }> {
  const access = requireAccess()
  const type = input.type ?? typeFromName(input.name)
  const doc = await fsOps.createFileWithContent(
    input.relativeDir || '',
    input.name,
    type,
    input.content,
    {
      encoding: input.encoding,
      mimeType: input.mimeType
    }
  )
  assertAccess(access)
  return {
    name: doc.name,
    type: doc.type,
    content: doc.content,
    relativePath: doc.relativePath,
    encoding: doc.encoding,
    mimeType: doc.mimeType
  }
}

export async function importPlainFromDisk(
  sender: Electron.WebContents,
  relativeDir = ''
): Promise<(ExportPlainResult & { relativePath: string }) | null> {
  const access = requireAccess()
  const win = BrowserWindow.fromWebContents(sender)
  const result = await dialog.showOpenDialog(win!, {
    properties: ['openFile'],
    filters: [
      {
        name: 'Media',
        extensions: [
          'png',
          'jpg',
          'jpeg',
          'gif',
          'webp',
          'bmp',
          'svg',
          'mp4',
          'webm',
          'mov',
          'mkv',
          'mp3',
          'wav',
          'ogg',
          'm4a',
          'flac'
        ]
      },
      { name: 'Documents', extensions: ['txt', 'md', 'markdown', 'json', 'yaml', 'yml', 'csv'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  if (result.canceled || !result.filePaths[0]) return null
  assertAccess(access)
  const filePath = result.filePaths[0]
  const base = basename(filePath)
  const type = typeFromName(base)
  const binary = isBinaryKind(type)
  const bytes = await readBoundedFile(filePath, binary ? MAX_MEDIA_BYTES : MAX_TEXT_IMPORT_BYTES, () => assertAccess(access))
  const content = binary ? bytes.toString('base64') : new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  assertAccess(access)
  return importPlainToActiveBox({
    name: base,
    content,
    relativeDir,
    type,
    encoding: binary ? 'base64' : 'utf-8',
    mimeType: binary ? mimeFromFileName(base, type) : undefined
  })
}

export async function saveDocument(input: SaveDocumentInput): Promise<SaveDocumentResult> {
  const access = getAccess()
  if (!access) {
    const err = new Error('NEEDS_ACCESS')
    err.name = 'NEEDS_ACCESS'
    throw err
  }

  const active = await getActiveEntry()
  assertAccess(access)
  if (!active) throw new Error('No active Secret Box')
  if (input.boxId !== undefined && input.boxId !== active.id) throw new Error('SESSION_CHANGED: Save belongs to a different box. Reopen the save dialog and retry.')
  if (resolve(active.rootPath) !== resolve(access.rootPath)) throw new Error('SESSION_CHANGED: Active box and signed-in box differ. Sign in again before saving.')

  const type = input.type
  if (isBinaryKind(type)) {
    throw new Error('Cannot save binary types via Save to Box — use Import in Private Box')
  }
  const name = ensureExtension(input.name, type)
  const dir = input.relativeDir ?? 'saves'
  const doc = await fsOps.createFileWithContent(dir, name, type, input.content)
  assertAccess(access)

  return {
    doc,
    boxId: active.id,
    boxName: active.name
  }
}

export async function prepareDefaultBoxForSave(): Promise<{
  boxId: string
  boxName: string
  mode: 'device' | 'portable' | null
  hasAccess: boolean
  sessionId?: string
}> {
  const def = await getDefaultVaultEntry()
  if (!def) throw new Error('Default Secret Box missing')
  const access = getAccess()
  const hasAccess = !!access && access.rootPath === def.rootPath
  if (!hasAccess) {
    await setActiveVault(def.id)
  }
  const cfg = await readVaultConfig(def.rootPath)
  const accessNow = getAccess()
  return {
    boxId: def.id,
    boxName: def.name,
    mode: cfg?.mode ?? 'device',
    hasAccess: !!accessNow && accessNow.rootPath === def.rootPath,
    sessionId: accessNow && accessNow.rootPath === def.rootPath ? getSessionId() : undefined
  }
}

export async function accessDefaultBox(keyB: string): Promise<void> {
  const revision = getAccessRevision()
  const def = await ensureDefaultSecretBox()
  assertAccessRevision(revision)
  await setActiveVault(def.id)
  await accessVault({ keyB })
}

export function suggestSaveName(type: DocType, prefix = 'export'): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  return ensureExtension(`${prefix}-${stamp}`, type)
}
