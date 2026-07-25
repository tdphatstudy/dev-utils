export const KEEP_FOLDER = 'keep'

export type KeepColor =
  | 'default'
  | 'coral'
  | 'peach'
  | 'sand'
  | 'mint'
  | 'sage'
  | 'fog'
  | 'dusk'
  | 'blossom'
  | 'clay'

export interface KeepNote {
  title: string
  body: string
  color: KeepColor
  pinned: boolean
  updatedAt: string
  createdAt?: string
}

export const KEEP_COLORS: { id: KeepColor; label: string; swatch: string }[] = [
  { id: 'default', label: 'Default', swatch: '#202124' },
  { id: 'coral', label: 'Coral', swatch: '#77172e' },
  { id: 'peach', label: 'Peach', swatch: '#692b17' },
  { id: 'sand', label: 'Sand', swatch: '#7c4a03' },
  { id: 'mint', label: 'Mint', swatch: '#0c625d' },
  { id: 'sage', label: 'Sage', swatch: '#256141' },
  { id: 'fog', label: 'Fog', swatch: '#284255' },
  { id: 'dusk', label: 'Dusk', swatch: '#472e5b' },
  { id: 'blossom', label: 'Blossom', swatch: '#6c394f' },
  { id: 'clay', label: 'Clay', swatch: '#4b443a' }
]

export function emptyKeepNote(partial?: Partial<KeepNote>): KeepNote {
  const now = new Date().toISOString()
  return {
    title: '',
    body: '',
    color: 'default',
    pinned: false,
    createdAt: now,
    updatedAt: now,
    ...partial
  }
}

export function parseKeepNote(raw: string): KeepNote {
  try {
    const j = JSON.parse(raw) as Partial<KeepNote>
    return emptyKeepNote({
      title: typeof j.title === 'string' ? j.title : '',
      body: typeof j.body === 'string' ? j.body : '',
      color: isKeepColor(j.color) ? j.color : 'default',
      pinned: !!j.pinned,
      createdAt: typeof j.createdAt === 'string' ? j.createdAt : undefined,
      updatedAt: typeof j.updatedAt === 'string' ? j.updatedAt : new Date().toISOString()
    })
  } catch {
    return emptyKeepNote({ body: raw })
  }
}

export function serializeKeepNote(note: KeepNote): string {
  return JSON.stringify(
    {
      title: note.title,
      body: note.body,
      color: note.color,
      pinned: note.pinned,
      createdAt: note.createdAt ?? note.updatedAt,
      updatedAt: note.updatedAt
    },
    null,
    2
  )
}

function isKeepColor(v: unknown): v is KeepColor {
  return typeof v === 'string' && KEEP_COLORS.some((c) => c.id === v)
}

export function keepNoteFileName(title: string): string {
  const base =
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'note'
  return `${base}.keep.json`
}
