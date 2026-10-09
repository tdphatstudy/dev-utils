import { randomUUID } from 'crypto'
import { existsSync } from 'fs'
import { mkdir, readdir, rename, rm } from 'fs/promises'
import { basename, dirname, join } from 'path'
import { getContentKind, isBinaryKind, mimeFromFileName } from '@shared/secret-box/content-kinds'
import { PUTL_EXT, VAULT_DIR } from '@shared/secret-box/constants'
import { joinRelative, normalizeRelative } from '@shared/secret-box/path-utils'
import type {
  DirEntry,
  DocContent,
  DocEncoding,
  DocType,
  DocPayload
} from '@shared/secret-box/types'
import { ensureExtension, typeFromName } from '@shared/secret-box/types'
import { openDoc, parseEnvelope, sealDoc, serializeEnvelope } from './crypto'
import { resolveVaultPath, toRelativeFromRoot } from './vault-paths'
import { requireAccess, assertAccess, getSessionId, type EphemeralAccess } from './session'
import type { KeepNotesPage } from '@shared/secret-box/types'
import { isPutlFile } from './vault'
import { atomicWriteFile } from './atomic-write'
import { readBoundedFile } from '../bounded-read'
import { MAX_ENVELOPE_BYTES } from '@shared/secret-box/limits'

function defaultContentFor(type: DocType): string {
  if (type === 'markdown') {
    return JSON.stringify(
      { notion: 1, blocks: [{ id: 'seed', type: 'h1', text: 'Untitled' }] },
      null,
      2
    )
  }
  if (type === 'keep-note') {
    const now = new Date().toISOString()
    return JSON.stringify(
      { title: '', body: '', color: 'default', pinned: false, createdAt: now, updatedAt: now },
      null,
      2
    )
  }
  return getContentKind(type).defaultContent
}

export async function listDir(relativePath: string): Promise<DirEntry[]> {
  const access = requireAccess()
  const abs = resolveVaultPath(relativePath || '')
  const entries = await readdir(abs, { withFileTypes: true })
  assertAccess(access)
  const out: DirEntry[] = []

  for (const ent of entries) {
    assertAccess(access)
    if (ent.name === VAULT_DIR) continue
    if (ent.name.startsWith('.')) continue

    if (ent.isDirectory()) {
      const rel = joinRelative(relativePath || '', ent.name)
      out.push({
        id: `dir:${rel}`,
        name: ent.name,
        kind: 'dir',
        relativePath: rel
      })
      continue
    }

    if (!ent.isFile() || !isPutlFile(ent.name)) continue
    const rel = joinRelative(relativePath || '', ent.name)
    try {
      const doc = await readFileInternal(rel, access)
      out.push({
        id: rel,
        name: doc.name,
        kind: 'file',
        type: doc.type,
        updatedAt: doc.updatedAt,
        relativePath: rel
      })
    } catch {
      assertAccess(access)
      out.push({
        id: rel,
        name: ent.name,
        kind: 'file',
        relativePath: rel
      })
    }
  }

  out.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  assertAccess(access)
  return out
}

async function readFileInternal(
  relativePath: string,
  access: EphemeralAccess = requireAccess()
): Promise<DocPayload & { relativePath: string }> {
  assertAccess(access)
  const abs = resolveVaultPath(relativePath)
  const bytes = await readBoundedFile(abs, MAX_ENVELOPE_BYTES, () => assertAccess(access))
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  assertAccess(access)
  const envelope = parseEnvelope(text)
  const doc = openDoc(access.keyA, access.keyB, envelope)
  return { ...doc, relativePath: normalizeRelative(relativePath) }
}

function toDocContent(
  relativePath: string,
  payload: Pick<
    DocPayload,
    'name' | 'type' | 'content' | 'updatedAt' | 'encoding' | 'mimeType'
  >
): DocContent {
  return {
    id: relativePath,
    name: payload.name,
    type: payload.type,
    content: payload.content,
    relativePath,
    updatedAt: payload.updatedAt,
    encoding: payload.encoding ?? 'utf-8',
    mimeType: payload.mimeType,
    sessionId: getSessionId()!
  }
}

export async function readDoc(relativePath: string): Promise<DocContent> {
  const access = requireAccess()
  const doc = await readFileInternal(relativePath, access)
  assertAccess(access)
  return toDocContent(doc.relativePath, {
    name: doc.name,
    type: doc.type,
    content: doc.content,
    updatedAt: doc.updatedAt,
    encoding: doc.encoding ?? 'utf-8',
    mimeType: doc.mimeType
  })
}

/** One decrypt per note, bounded pages; plaintext only lives in the current call/UI. */
export async function listKeepNotes(relativePath: string, cursor?: string): Promise<KeepNotesPage> {
  const access = requireAccess()
  const entries = (await readdir(resolveVaultPath(relativePath), { withFileTypes: true }))
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.') && isPutlFile(entry.name))
    .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  assertAccess(access)
  const remaining = cursor ? entries.filter((entry) => entry.name > cursor) : entries
  const notes: DocContent[] = [], unreadable: string[] = []
  let bytes = 0, examined = 0
  for (const entry of remaining.slice(0, 200)) {
    const rel = joinRelative(relativePath, entry.name)
    try {
      const payload = await readFileInternal(rel, access)
      if (payload.type === 'keep-note' || payload.name.endsWith('.keep.json')) {
        const size = Buffer.byteLength(payload.content, 'utf8')
        if (size > 8 * 1024 * 1024) throw new Error('Note exceeds 8 MiB. Open it in Private Box.')
        if (notes.length && bytes + size > 8 * 1024 * 1024) break
        bytes += size
        notes.push(toDocContent(rel, payload))
      }
    } catch (error) {
      assertAccess(access)
      unreadable.push(`${entry.name}: ${error instanceof Error ? error.message : 'Could not read note'}`)
    }
    examined++
  }
  assertAccess(access)
  return { notes, unreadable, nextCursor: examined < remaining.length && examined > 0 ? remaining[examined - 1].name : null }
}

export async function writeDoc(relativePath: string, content: string): Promise<DocContent> {
  const access = requireAccess()
  const abs = resolveVaultPath(relativePath)
  const existing = await readFileInternal(relativePath, access)
  assertAccess(access)
  if (isBinaryKind(existing.type) || existing.encoding === 'base64') {
    throw new Error('Binary / media files are read-only in the editor — re-import to replace')
  }
  const now = new Date().toISOString()
  const payload: DocPayload = {
    name: existing.name,
    type: existing.type,
    encoding: existing.encoding ?? 'utf-8',
    createdAt: existing.createdAt,
    updatedAt: now,
    content,
    mimeType: existing.mimeType
  }
  const envelope = sealDoc(access.keyA, access.keyB, access.mode, payload)
  await atomicWriteFile(abs, serializeEnvelope(envelope), 'utf8', undefined, () => {
    assertAccess(access); resolveVaultPath(relativePath)
  })
  assertAccess(access)
  return toDocContent(relativePath, payload)
}

export async function createFile(
  relativeDir: string,
  name: string,
  type: DocType
): Promise<DocContent> {
  if (isBinaryKind(type)) {
    throw new Error('Create media via Import file… (upload from disk)')
  }
  return createFileWithContent(relativeDir, name, type, defaultContentFor(type))
}

export interface CreateFileOptions {
  encoding?: DocEncoding
  mimeType?: string
}

export async function createFileWithContent(
  relativeDir: string,
  name: string,
  type: DocType,
  content: string,
  options: CreateFileOptions = {}
): Promise<DocContent> {
  const access = requireAccess()
  const logicalName = ensureExtension(name, type)
  const dir = normalizeRelative(relativeDir || '')
  const diskName = `${randomUUID()}${PUTL_EXT}`
  const rel = joinRelative(dir, diskName)
  const absDir = resolveVaultPath(dir)
  await mkdir(absDir, { recursive: true })
  assertAccess(access)

  const now = new Date().toISOString()
  const resolvedType = typeFromName(logicalName) === 'text' && type !== 'text' ? type : typeFromName(logicalName)
  // Prefer explicit type for media imports (name may force typeFromName correctly)
  const finalType =
    type === 'image' || type === 'video' || type === 'audio' || type === 'binary'
      ? type
      : resolvedType

  const encoding: DocEncoding =
    options.encoding ?? (isBinaryKind(finalType) ? 'base64' : 'utf-8')
  const mimeType =
    options.mimeType ??
    (isBinaryKind(finalType) ? mimeFromFileName(logicalName, finalType) : undefined)

  const payload: DocPayload = {
    name: logicalName,
    type: finalType,
    encoding,
    createdAt: now,
    updatedAt: now,
    content,
    mimeType
  }
  const envelope = sealDoc(access.keyA, access.keyB, access.mode, payload)
  const abs = resolveVaultPath(rel)
  await atomicWriteFile(abs, serializeEnvelope(envelope), 'utf8', undefined, () => {
    assertAccess(access); resolveVaultPath(rel)
  })
  assertAccess(access)
  return toDocContent(rel, payload)
}

export async function mkdirPath(relativePath: string): Promise<void> {
  const access = requireAccess()
  const abs = resolveVaultPath(relativePath)
  await mkdir(abs, { recursive: true })
  assertAccess(access)
}

export async function renameEntry(relativePath: string, newName: string): Promise<DirEntry> {
  const access = requireAccess()
  const abs = resolveVaultPath(relativePath, false)
  const name = newName.trim()
  if (!name || name.includes('/') || name.includes('\\') || name.includes('..') || /[\x00-\x1f\x7f]/.test(name) || name.toLowerCase() === VAULT_DIR.toLowerCase()) {
    throw new Error('Invalid name')
  }

  if (isPutlFile(basename(abs))) {
    const doc = await readFileInternal(relativePath, access)
    assertAccess(access)
    const namedType = typeFromName(name)
    const type = isBinaryKind(doc.type) ? doc.type : namedType
    if (!isBinaryKind(doc.type) && isBinaryKind(namedType)) {
      throw new Error('Changing a text file to a media type requires importing the media file.')
    }
    const logical = ensureExtension(name, type)
    const now = new Date().toISOString()
    const payload: DocPayload = {
      name: logical,
      type,
      encoding: doc.encoding ?? 'utf-8',
      createdAt: doc.createdAt,
      updatedAt: now,
      content: doc.content,
      mimeType: doc.mimeType
    }
    const envelope = sealDoc(access.keyA, access.keyB, access.mode, payload)
    await atomicWriteFile(abs, serializeEnvelope(envelope), 'utf8', undefined, () => {
      assertAccess(access); resolveVaultPath(relativePath, false)
    })
    assertAccess(access)
    return {
      id: relativePath,
      name: logical,
      kind: 'file',
      type,
      updatedAt: now,
      relativePath
    }
  }

  const parent = dirname(abs)
  const dest = join(parent, name)
  resolveVaultPath(toRelativeFromRoot(dest), false)
  if (existsSync(dest)) throw new Error('Name already exists')
  await rename(abs, dest)
  assertAccess(access)
  const rel = toRelativeFromRoot(dest)
  return {
    id: `dir:${rel}`,
    name,
    kind: 'dir',
    relativePath: rel
  }
}

export async function removeEntry(relativePath: string): Promise<void> {
  const access = requireAccess()
  const abs = resolveVaultPath(relativePath, false)
  await rm(abs, { recursive: true, force: true })
  assertAccess(access)
}

export async function listFoldersRecursive(relativePath = ''): Promise<DirEntry[]> {
  const access = requireAccess()
  const result: DirEntry[] = []
  async function walk(rel: string): Promise<void> {
    assertAccess(access)
    const abs = resolveVaultPath(rel || '')
    const entries = await readdir(abs, { withFileTypes: true })
    assertAccess(access)
    for (const ent of entries) {
      if (ent.name === VAULT_DIR || ent.name.startsWith('.')) continue
      if (!ent.isDirectory()) continue
      const child = joinRelative(rel || '', ent.name)
      result.push({
        id: `dir:${child}`,
        name: ent.name,
        kind: 'dir',
        relativePath: child
      })
      await walk(child)
    }
  }
  await walk(relativePath)
  return result
}
