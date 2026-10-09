import { messageKey } from '@shared/i18n/message-key'
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
    label: messageKey('Heading 1'),
    description: messageKey('Large section title'),
    aliases: ['h1', 'title', 'heading1'],
    insert: '# '
  },
  {
    id: 'h2',
    label: messageKey('Heading 2'),
    description: messageKey('Medium section title'),
    aliases: ['h2', 'heading2'],
    insert: '## '
  },
  {
    id: 'h3',
    label: messageKey('Heading 3'),
    description: messageKey('Small section title'),
    aliases: ['h3', 'heading3'],
    insert: '### '
  },
  {
    id: 'bullet',
    label: messageKey('Bullet list'),
    description: messageKey('Unordered list item'),
    aliases: ['bullet', 'ul', 'list'],
    insert: '- '
  },
  {
    id: 'number',
    label: messageKey('Numbered list'),
    description: messageKey('Ordered list item'),
    aliases: ['number', 'ol', 'ordered'],
    insert: '1. '
  },
  {
    id: 'todo',
    label: messageKey('To-do'),
    description: messageKey('Checkbox task'),
    aliases: ['todo', 'task', 'check'],
    insert: '- [ ] '
  },
  {
    id: 'quote',
    label: messageKey('Quote'),
    description: messageKey('Block quote'),
    aliases: ['quote', 'blockquote'],
    insert: '> '
  },
  {
    id: 'code',
    label: messageKey('Code block'),
    description: messageKey('Fenced code block'),
    aliases: ['code', 'codeblock', 'pre'],
    insert: '```\n\n```',
    cursorBack: 4
  },
  {
    id: 'divider',
    label: messageKey('Divider'),
    description: messageKey('Horizontal rule'),
    aliases: ['divider', 'hr', 'line'],
    insert: '\n---\n'
  },
  {
    id: 'callout',
    label: messageKey('Callout'),
    description: messageKey('Highlighted note'),
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
