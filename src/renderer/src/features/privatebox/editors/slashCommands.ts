export interface SlashCommand {
  id: string
  label: string
  description: string
  aliases: string[]
  /** Inserted at the start of the current line (replaces /query) */
  insert: string
  /** Place cursor offset from end of insert (negative = left of end) */
  cursorBack?: number
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'h1',
    label: 'Heading 1',
    description: 'Large section title',
    aliases: ['h1', 'title', 'heading1'],
    insert: '# '
  },
  {
    id: 'h2',
    label: 'Heading 2',
    description: 'Medium section title',
    aliases: ['h2', 'heading2'],
    insert: '## '
  },
  {
    id: 'h3',
    label: 'Heading 3',
    description: 'Small section title',
    aliases: ['h3', 'heading3'],
    insert: '### '
  },
  {
    id: 'bullet',
    label: 'Bullet list',
    description: 'Unordered list item',
    aliases: ['bullet', 'ul', 'list'],
    insert: '- '
  },
  {
    id: 'number',
    label: 'Numbered list',
    description: 'Ordered list item',
    aliases: ['number', 'ol', 'ordered'],
    insert: '1. '
  },
  {
    id: 'todo',
    label: 'To-do',
    description: 'Checkbox task',
    aliases: ['todo', 'task', 'check'],
    insert: '- [ ] '
  },
  {
    id: 'quote',
    label: 'Quote',
    description: 'Block quote',
    aliases: ['quote', 'blockquote'],
    insert: '> '
  },
  {
    id: 'code',
    label: 'Code block',
    description: 'Fenced code block',
    aliases: ['code', 'codeblock', 'pre'],
    insert: '```\n\n```',
    cursorBack: 4
  },
  {
    id: 'divider',
    label: 'Divider',
    description: 'Horizontal rule',
    aliases: ['divider', 'hr', 'line'],
    insert: '\n---\n'
  },
  {
    id: 'callout',
    label: 'Callout',
    description: 'Highlighted note',
    aliases: ['callout', 'note', 'info'],
    insert: '> **Note:** '
  }
]

export function filterSlashCommands(query: string): SlashCommand[] {
  const q = query.trim().toLowerCase()
  if (!q) return SLASH_COMMANDS
  return SLASH_COMMANDS.filter(
    (c) =>
      c.id.includes(q) ||
      c.label.toLowerCase().includes(q) ||
      c.aliases.some((a) => a.includes(q))
  )
}

/** Detect `/query` at the start of the line containing caret. */
export function detectSlashQuery(
  text: string,
  caret: number
): { start: number; end: number; query: string } | null {
  const before = text.slice(0, caret)
  const lineStart = before.lastIndexOf('\n') + 1
  const linePrefix = before.slice(lineStart)
  const m = /^(\s*)\/([^\s]*)$/.exec(linePrefix)
  if (!m) return null
  const slashAt = lineStart + m[1]!.length
  return { start: slashAt, end: caret, query: m[2] ?? '' }
}

export function applySlashCommand(
  text: string,
  caret: number,
  cmd: SlashCommand
): { text: string; caret: number } {
  const hit = detectSlashQuery(text, caret)
  if (!hit) return { text, caret }
  const before = text.slice(0, hit.start)
  const after = text.slice(hit.end)
  const next = before + cmd.insert + after
  const caretPos = before.length + cmd.insert.length + (cmd.cursorBack ?? 0)
  return { text: next, caret: caretPos }
}
