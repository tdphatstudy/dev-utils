import { randomUUID } from 'crypto'
import { existsSync } from 'fs'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'fs/promises'
import { basename, dirname, join } from 'path'
import { getContentKind } from '@shared/secret-box/content-kinds'
import { PUTL_EXT, VAULT_DIR } from '@shared/secret-box/constants'
import { joinRelative, normalizeRelative } from '@shared/secret-box/path-utils'
import type { DirEntry, DocContent, DocType, DocPayload } from '@shared/secret-box/types'
import { ensureExtension, typeFromName } from '@shared/secret-box/types'
import { openDoc, parseEnvelope, sealDoc, serializeEnvelope } from './crypto'
import { resolveVaultPath, toRelativeFromRoot } from './vault-paths'
import { requireAccess } from './session'
import { isPutlFile } from './vault'

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
  requireAccess()
  const abs = resolveVaultPath(relativePath || '')
  const entries = await readdir(abs, { withFileTypes: true })
  const out: DirEntry[] = []

  for (const ent of entries) {
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
      const doc = await readFileInternal(rel)
      out.push({
        id: rel,
        name: doc.name,
        kind: 'file',
        type: doc.type,
        updatedAt: doc.updatedAt,
        relativePath: rel
      })
    } catch {
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
  return out
}

async function readFileInternal(
  relativePath: string
): Promise<DocPayload & { relativePath: string }> {
  const access = requireAccess()
  const abs = resolveVaultPath(relativePath)
  const text = await readFile(abs, 'utf8')
  const envelope = parseEnvelope(text)
  const doc = openDoc(access.keyA, access.keyB, envelope)
  return { ...doc, relativePath: normalizeRelative(relativePath) }
}

export async function readDoc(relativePath: string): Promise<DocContent> {
  const doc = await readFileInternal(relativePath)
  return {
    id: doc.relativePath,
    name: doc.name,
    type: doc.type,
    content: doc.content,
    relativePath: doc.relativePath,
    updatedAt: doc.updatedAt
  }
}

export async function writeDoc(relativePath: string, content: string): Promise<DocContent> {
  const access = requireAccess()
  const existing = await readFileInternal(relativePath)
  const now = new Date().toISOString()
  const payload: DocPayload = {
    name: existing.name,
    type: existing.type,
    encoding: 'utf-8',
    createdAt: existing.createdAt,
    updatedAt: now,
    content
  }
  const envelope = sealDoc(access.keyA, access.keyB, access.mode, payload)
  await writeFile(resolveVaultPath(relativePath), serializeEnvelope(envelope), 'utf8')
  return {
    id: relativePath,
    name: payload.name,
    type: payload.type,
    content: payload.content,
    relativePath,
    updatedAt: now
  }
}

export async function createFile(
  relativeDir: string,
  name: string,
  type: DocType
): Promise<DocContent> {
  return createFileWithContent(relativeDir, name, type, defaultContentFor(type))
}

export async function createFileWithContent(
  relativeDir: string,
  name: string,
  type: DocType,
  content: string
): Promise<DocContent> {
  const access = requireAccess()
  const logicalName = ensureExtension(name, type)
  const dir = normalizeRelative(relativeDir || '')
  const diskName = `${randomUUID()}${PUTL_EXT}`
  const rel = joinRelative(dir, diskName)
  const absDir = resolveVaultPath(dir)
  await mkdir(absDir, { recursive: true })

  const now = new Date().toISOString()
  const resolvedType = typeFromName(logicalName)
  const payload: DocPayload = {
    name: logicalName,
    type: resolvedType,
    encoding: 'utf-8',
    createdAt: now,
    updatedAt: now,
    content
  }
  const envelope = sealDoc(access.keyA, access.keyB, access.mode, payload)
  await writeFile(resolveVaultPath(rel), serializeEnvelope(envelope), 'utf8')
  return {
    id: rel,
    name: payload.name,
    type: payload.type,
    content: payload.content,
    relativePath: rel,
    updatedAt: now
  }
}

export async function mkdirPath(relativePath: string): Promise<void> {
  requireAccess()
  const abs = resolveVaultPath(relativePath)
  await mkdir(abs, { recursive: true })
}

export async function renameEntry(relativePath: string, newName: string): Promise<DirEntry> {
  const access = requireAccess()
  const abs = resolveVaultPath(relativePath)
  const name = newName.trim()
  if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) {
    throw new Error('Invalid name')
  }

  if (isPutlFile(basename(abs))) {
    const doc = await readFileInternal(relativePath)
    const type = typeFromName(name)
    const logical = ensureExtension(name, type)
    const now = new Date().toISOString()
    const payload: DocPayload = {
      ...doc,
      name: logical,
      type,
      updatedAt: now
    }
    const envelope = sealDoc(access.keyA, access.keyB, access.mode, payload)
    await writeFile(abs, serializeEnvelope(envelope), 'utf8')
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
  if (existsSync(dest)) throw new Error('Name already exists')
  await rename(abs, dest)
  const rel = toRelativeFromRoot(dest)
  return {
    id: `dir:${rel}`,
    name,
    kind: 'dir',
    relativePath: rel
  }
}

export async function removeEntry(relativePath: string): Promise<void> {
  requireAccess()
  const abs = resolveVaultPath(relativePath)
  await rm(abs, { recursive: true, force: true })
}

export async function listFoldersRecursive(relativePath = ''): Promise<DirEntry[]> {
  requireAccess()
  const result: DirEntry[] = []
  async function walk(rel: string): Promise<void> {
    const abs = resolveVaultPath(rel || '')
    const entries = await readdir(abs, { withFileTypes: true })
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
