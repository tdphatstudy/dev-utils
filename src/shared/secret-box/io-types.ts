import type { DocContent, DocEncoding, DocType } from './types'

export interface SaveDocumentInput {
  /** Pin a save dialog/composer to the box it prepared, across separate IPC calls. */
  boxId?: string
  name: string
  type: DocType
  content: string
  /** Relative folder inside active box (default root) */
  relativeDir?: string
}

export interface ExportPlainResult {
  name: string
  type: DocType
  content: string
  relativePath: string
  encoding?: DocEncoding
  mimeType?: string
}

export interface ImportPlainInput {
  name: string
  type?: DocType
  content: string
  relativeDir?: string
  encoding?: DocEncoding
  mimeType?: string
}

export interface SaveDocumentResult {
  doc: DocContent
  boxId: string
  boxName: string
}
