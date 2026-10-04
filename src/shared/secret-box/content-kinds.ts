export type ContentKindId =
  | 'text'
  | 'markdown'
  | 'json'
  | 'keep-note'
  | 'image'
  | 'video'
  | 'audio'
  | 'binary'

export type ContentEditorKind = 'text' | 'markdown' | 'json' | 'media' | 'binary'

export interface ContentKindDef {
  id: ContentKindId
  label: string
  /** Primary extension including dot */
  extension: string
  extensions: string[]
  language: 'text' | 'markdown' | 'json' | 'binary'
  defaultContent: string
  /** Binary payloads stored as base64 inside .putl */
  binary?: boolean
  /** Future Keep notes live under this relative folder in a box */
  defaultFolder?: string
}

const KIND_LIST: ContentKindDef[] = [
  {
    id: 'text',
    label: 'Text',
    extension: '.txt',
    extensions: ['.txt', '.text', '.log', '.csv', '.tsv'],
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
    defaultContent:
      '{\n  "title": "",\n  "body": "",\n  "color": "default",\n  "pinned": false,\n  "updatedAt": ""\n}\n',
    defaultFolder: 'keep'
  },
  {
    id: 'image',
    label: 'Image',
    extension: '.png',
    extensions: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.ico', '.avif'],
    language: 'binary',
    defaultContent: '',
    binary: true
  },
  {
    id: 'video',
    label: 'Video',
    extension: '.mp4',
    extensions: ['.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v'],
    language: 'binary',
    defaultContent: '',
    binary: true
  },
  {
    id: 'audio',
    label: 'Audio',
    extension: '.mp3',
    extensions: ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.opus'],
    language: 'binary',
    defaultContent: '',
    binary: true
  },
  {
    id: 'binary',
    label: 'File',
    extension: '.bin',
    extensions: ['.bin', '.pdf', '.zip', '.gz', '.7z', '.rar', '.wasm', '.dat'],
    language: 'binary',
    defaultContent: '',
    binary: true
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

export function isBinaryKind(id: ContentKindId): boolean {
  return !!getContentKind(id).binary
}

/** Editors in Private Box */
export function editorKindFor(id: ContentKindId): ContentEditorKind {
  if (id === 'markdown') return 'markdown'
  if (id === 'json' || id === 'keep-note') return 'json'
  if (id === 'image' || id === 'video' || id === 'audio') return 'media'
  if (id === 'binary') return 'binary'
  return 'text'
}

/** Guess MIME from filename for media playback / export. */
export function mimeFromFileName(name: string, kind: ContentKindId): string {
  const lower = name.toLowerCase()
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.avif': 'image/avif',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.m4v': 'video/x-m4v',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.flac': 'audio/flac',
    '.aac': 'audio/aac',
    '.opus': 'audio/opus',
    '.pdf': 'application/pdf'
  }
  for (const [ext, mime] of Object.entries(map)) {
    if (lower.endsWith(ext)) return mime
  }
  if (kind === 'image') return 'image/png'
  if (kind === 'video') return 'video/mp4'
  if (kind === 'audio') return 'audio/mpeg'
  return 'application/octet-stream'
}
