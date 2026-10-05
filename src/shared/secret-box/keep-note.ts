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

function readKeepObject(raw: string): Partial<KeepNote> | null {
  try {
    const j = JSON.parse(raw) as Partial<KeepNote> | null
    if (!j || typeof j !== 'object' || Array.isArray(j) ||
        typeof j.title !== 'string' && typeof j.body !== 'string' ||
        j.title !== undefined && typeof j.title !== 'string' ||
        j.body !== undefined && typeof j.body !== 'string' ||
        j.pinned !== undefined && typeof j.pinned !== 'boolean' ||
        j.color !== undefined && !isKeepColor(j.color) ||
        j.createdAt !== undefined && typeof j.createdAt !== 'string' ||
        j.updatedAt !== undefined && typeof j.updatedAt !== 'string') {
      return null
    }
    return j
  } catch {
    return null
  }
}

export function parseKeepNote(raw: string): KeepNote {
  const j = readKeepObject(raw)
  if (!j) return emptyKeepNote({ body: raw })
  return emptyKeepNote({
    title: typeof j.title === 'string' ? j.title : '',
    body: typeof j.body === 'string' ? j.body : '',
    color: isKeepColor(j.color) ? j.color : 'default',
    pinned: !!j.pinned,
    createdAt: typeof j.createdAt === 'string' ? j.createdAt : undefined,
    updatedAt: typeof j.updatedAt === 'string' ? j.updatedAt : new Date().toISOString()
  })
}

export function serializeKeepNote(note: KeepNote, originalRaw?: string): string {
  const fields = {
    title: note.title,
    body: note.body,
    color: note.color,
    pinned: note.pinned,
    createdAt: note.createdAt ?? note.updatedAt,
    updatedAt: note.updatedAt
  }
  if (originalRaw !== undefined && readKeepObject(originalRaw)) {
    return patchKeepFields(originalRaw, fields)
  }
  return JSON.stringify(fields, null, 2)
}

/** Patch owned root values only; unknown members retain their exact JSON bytes. */
function patchKeepFields(raw: string, fields: Record<string, string | boolean>): string {
  const tokens = [...raw.matchAll(/"(?:\\[\s\S]|[^"\\])*"|[^\s"{}\[\],:]+|[{}\[\],:]/g)]
  const changes: { start: number; end: number; text: string }[] = []
  const seen = new Set<string>()
  let i = 1 // The caller has validated a root object.
  while (i < tokens.length - 1) {
    const key = JSON.parse(tokens[i][0]) as string
    const valueStart = i + 2
    i = valueStart
    let depth = 0
    while (i < tokens.length) {
      const token = tokens[i][0]
      if (depth === 0 && (token === ',' || token === '}')) break
      if (token === '{' || token === '[') depth++
      if (token === '}' || token === ']') depth--
      i++
    }
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      seen.add(key)
      const last = tokens[i - 1]
      changes.push({ start: tokens[valueStart].index!, end: last.index! + last[0].length,
        text: JSON.stringify(fields[key]) })
    }
    if (tokens[i][0] === '}') break
    i++
  }
  const missing = Object.entries(fields).filter(([key]) => !seen.has(key))
  if (missing.length) {
    changes.push({ start: tokens[i].index!, end: tokens[i].index!,
      text: ',\n  ' + missing.map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`).join(',\n  ') + '\n' })
  }
  let output = raw
  for (const change of changes.reverse()) {
    output = output.slice(0, change.start) + change.text + output.slice(change.end)
  }
  return output
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
