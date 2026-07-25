export type BlockType =
  | 'p'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bullet'
  | 'number'
  | 'todo'
  | 'quote'
  | 'code'
  | 'divider'

export interface NotionBlock {
  id: string
  type: BlockType
  text: string
  checked?: boolean
}

export interface NotionDoc {
  notion: 1
  blocks: NotionBlock[]
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function emptyBlock(type: BlockType = 'p'): NotionBlock {
  return { id: newId(), type, text: '', checked: type === 'todo' ? false : undefined }
}

export function emptyDoc(): NotionDoc {
  return { notion: 1, blocks: [emptyBlock('p')] }
}

export function isNotionDoc(raw: string): boolean {
  const t = raw.trim()
  if (!t.startsWith('{')) return false
  try {
    const j = JSON.parse(t) as Partial<NotionDoc>
    return j.notion === 1 && Array.isArray(j.blocks)
  } catch {
    return false
  }
}

export function parseDoc(raw: string): NotionDoc {
  if (!raw.trim()) return emptyDoc()
  if (isNotionDoc(raw)) {
    const j = JSON.parse(raw) as NotionDoc
    if (!j.blocks.length) j.blocks = [emptyBlock('p')]
    return j
  }
  // legacy plain markdown → blocks
  return { notion: 1, blocks: markdownToBlocks(raw) }
}

export function serializeDoc(doc: NotionDoc): string {
  return JSON.stringify({ notion: 1, blocks: doc.blocks }, null, 2)
}

export function markdownToBlocks(md: string): NotionBlock[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const blocks: NotionBlock[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (line.startsWith('```')) {
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i]!.startsWith('```')) {
        code.push(lines[i]!)
        i++
      }
      i++
      blocks.push({ id: newId(), type: 'code', text: code.join('\n') })
      continue
    }
    if (/^---+$/.test(line.trim())) {
      blocks.push({ id: newId(), type: 'divider', text: '' })
      i++
      continue
    }
    if (line.startsWith('# ')) {
      blocks.push({ id: newId(), type: 'h1', text: line.slice(2) })
    } else if (line.startsWith('## ')) {
      blocks.push({ id: newId(), type: 'h2', text: line.slice(3) })
    } else if (line.startsWith('### ')) {
      blocks.push({ id: newId(), type: 'h3', text: line.slice(4) })
    } else if (/^- \[[ xX]\] /.test(line)) {
      blocks.push({
        id: newId(),
        type: 'todo',
        text: line.replace(/^- \[[ xX]\] /, ''),
        checked: /^- \[[xX]\] /.test(line)
      })
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      blocks.push({ id: newId(), type: 'bullet', text: line.slice(2) })
    } else if (/^\d+\.\s/.test(line)) {
      blocks.push({ id: newId(), type: 'number', text: line.replace(/^\d+\.\s/, '') })
    } else if (line.startsWith('> ')) {
      blocks.push({ id: newId(), type: 'quote', text: line.slice(2) })
    } else if (!line.trim()) {
      // skip empty
    } else {
      blocks.push({ id: newId(), type: 'p', text: line })
    }
    i++
  }
  return blocks.length ? blocks : [emptyBlock('p')]
}

export interface SlashItem {
  id: BlockType
  label: string
  description: string
  aliases: string[]
}

export const SLASH_ITEMS: SlashItem[] = [
  { id: 'h1', label: 'Heading 1', description: 'Large title', aliases: ['h1', 'title'] },
  { id: 'h2', label: 'Heading 2', description: 'Medium title', aliases: ['h2'] },
  { id: 'h3', label: 'Heading 3', description: 'Small title', aliases: ['h3'] },
  { id: 'p', label: 'Text', description: 'Plain paragraph', aliases: ['text', 'p', 'paragraph'] },
  { id: 'bullet', label: 'Bullet list', description: 'List item', aliases: ['bullet', 'ul', 'list'] },
  { id: 'number', label: 'Numbered list', description: 'Ordered item', aliases: ['number', 'ol'] },
  { id: 'todo', label: 'To-do', description: 'Checkbox', aliases: ['todo', 'task', 'check'] },
  { id: 'quote', label: 'Quote', description: 'Callout quote', aliases: ['quote'] },
  { id: 'code', label: 'Code', description: 'Code block', aliases: ['code', 'codeblock'] },
  { id: 'divider', label: 'Divider', description: 'Horizontal line', aliases: ['divider', 'hr'] }
]

export function filterSlash(query: string): SlashItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return SLASH_ITEMS
  return SLASH_ITEMS.filter(
    (c) =>
      c.id.includes(q) ||
      c.label.toLowerCase().includes(q) ||
      c.aliases.some((a) => a.startsWith(q) || a.includes(q))
  )
}
