import type { DocContent, DocType } from './types'

export interface SaveDocumentInput {
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
}

export interface ImportPlainInput {
  name: string
  type?: DocType
  content: string
  relativeDir?: string
}

export interface SaveDocumentResult {
  doc: DocContent
  boxId: string
  boxName: string
}
