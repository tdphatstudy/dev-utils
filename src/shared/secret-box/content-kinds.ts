export type ContentKindId = 'text' | 'markdown' | 'json' | 'keep-note'

export interface ContentKindDef {
  id: ContentKindId
  label: string
  /** Primary extension including dot */
  extension: string
  extensions: string[]
  language: 'text' | 'markdown' | 'json'
  defaultContent: string
  /** Future Keep notes live under this relative folder in a box */
  defaultFolder?: string
}

const KIND_LIST: ContentKindDef[] = [
  {
    id: 'text',
    label: 'Text',
    extension: '.txt',
    extensions: ['.txt', '.text', '.log'],
    language: 'text',
    defaultContent: ''
  },
  {
    id: 'markdown',
    label: 'Markdown',
    extension: '.md',
    extensions: ['.md', '.markdown'],
    language: 'markdown',
    defaultContent: ''
  },
  {
    id: 'json',
    label: 'JSON',
    extension: '.json',
    extensions: ['.json'],
    language: 'json',
    defaultContent: '{\n  \n}\n'
  },
  {
    id: 'keep-note',
    label: 'Keep note',
    extension: '.keep.json',
    extensions: ['.keep.json'],
    language: 'json',
    defaultContent: '{\n  "title": "",\n  "body": "",\n  "color": "default",\n  "pinned": false,\n  "updatedAt": ""\n}\n',
    defaultFolder: 'keep'
  }
]

export const CONTENT_KIND_IDS = KIND_LIST.map((k) => k.id)

const BY_ID = Object.fromEntries(KIND_LIST.map((k) => [k.id, k])) as Record<
  ContentKindId,
  ContentKindDef
>

export function getContentKind(id: ContentKindId): ContentKindDef {
  return BY_ID[id]
}

export function listContentKinds(): ContentKindDef[] {
  return KIND_LIST.slice()
}

/** Editors in Private Box today — keep-note uses JSON editor until Keep UI ships */
export function editorKindFor(id: ContentKindId): 'text' | 'markdown' | 'json' {
  if (id === 'markdown') return 'markdown'
  if (id === 'json' || id === 'keep-note') return 'json'
  return 'text'
}
