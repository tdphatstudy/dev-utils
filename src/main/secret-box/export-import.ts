import { BrowserWindow, dialog } from 'electron'
import { writeFile } from 'fs/promises'
import { basename } from 'path'
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
import * as fsOps from './fs-ops'
import { getAccess } from './session'
import {
  accessVault,
  ensureDefaultSecretBox,
  getActiveEntry,
  getDefaultVaultEntry,
  readVaultConfig,
  setActiveVault
} from './vault'

export async function exportDocPlain(relativePath: string): Promise<ExportPlainResult> {
  const doc = await fsOps.readDoc(relativePath)
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
  const plain = await exportDocPlain(relativePath)
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
  requireOpenAccess()
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
  requireOpenAccess()
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
  const filePath = result.filePaths[0]
  const { readFile, stat } = await import('fs/promises')
  const base = basename(filePath)
  const type = typeFromName(base)
  const st = await stat(filePath)

  if (isBinaryKind(type) || st.size > 0) {
    // Prefer binary path for known media / any large-ish non-text
    if (isBinaryKind(type)) {
      if (st.size > MAX_MEDIA_BYTES) {
        throw new Error(
          `File too large (${Math.round(st.size / (1024 * 1024))} MB). Max ${Math.round(MAX_MEDIA_BYTES / (1024 * 1024))} MB for encrypted media in Secret Box.`
        )
      }
      const buf = await readFile(filePath)
      const content = buf.toString('base64')
      return importPlainToActiveBox({
        name: base,
        content,
        relativeDir,
        type,
        encoding: 'base64',
        mimeType: mimeFromFileName(base, type)
      })
    }
  }

  // Text-like
  const content = await readFile(filePath, 'utf8')
  return importPlainToActiveBox({
    name: base,
    content,
    relativeDir,
    type
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
  if (!active) throw new Error('No active Secret Box')

  const type = input.type
  if (isBinaryKind(type)) {
    throw new Error('Cannot save binary types via Save to Box — use Import in Private Box')
  }
  const name = ensureExtension(input.name, type)
  const dir = input.relativeDir ?? 'saves'
  const doc = await fsOps.createFileWithContent(dir, name, type, input.content)

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
    hasAccess: !!accessNow && accessNow.rootPath === def.rootPath
  }
}

export async function accessDefaultBox(keyB: string): Promise<void> {
  const def = await ensureDefaultSecretBox()
  await setActiveVault(def.id)
  await accessVault({ keyB })
}

function requireOpenAccess(): void {
  if (!getAccess()) {
    const err = new Error('NEEDS_ACCESS')
    err.name = 'NEEDS_ACCESS'
    throw err
  }
}

export function suggestSaveName(type: DocType, prefix = 'export'): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  return ensureExtension(`${prefix}-${stamp}`, type)
}
