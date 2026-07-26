export type MarkupResult =
  | { ok: true; text: string }
  | { ok: false; error: string; line?: number }

const VOID_LIKE = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr'
])

type Token =
  | { kind: 'decl'; value: string }
  | { kind: 'comment'; value: string }
  | { kind: 'cdata'; value: string }
  | { kind: 'open'; name: string; raw: string; selfClosing: boolean }
  | { kind: 'close'; name: string; raw: string }
  | { kind: 'text'; value: string }

function lineAt(input: string, index: number): number {
  return input.slice(0, index).split(/\n/).length
}

function tokenizeXml(input: string): { ok: true; tokens: Token[] } | { ok: false; error: string; line?: number } {
  const tokens: Token[] = []
  let i = 0
  const n = input.length

  while (i < n) {
    if (input[i] === '<') {
      if (input.startsWith('<!--', i)) {
        const end = input.indexOf('-->', i + 4)
        if (end < 0) return { ok: false, error: 'Unclosed comment', line: lineAt(input, i) }
        tokens.push({ kind: 'comment', value: input.slice(i, end + 3) })
        i = end + 3
        continue
      }
      if (input.startsWith('<![CDATA[', i)) {
        const end = input.indexOf(']]>', i + 9)
        if (end < 0) return { ok: false, error: 'Unclosed CDATA', line: lineAt(input, i) }
        tokens.push({ kind: 'cdata', value: input.slice(i, end + 3) })
        i = end + 3
        continue
      }
      if (input.startsWith('<?', i) || input.startsWith('<!', i)) {
        const end = input.indexOf('>', i + 2)
        if (end < 0) return { ok: false, error: 'Unclosed declaration', line: lineAt(input, i) }
        tokens.push({ kind: 'decl', value: input.slice(i, end + 1) })
        i = end + 1
        continue
      }
      if (input.startsWith('</', i)) {
        const end = input.indexOf('>', i + 2)
        if (end < 0) return { ok: false, error: 'Unclosed end tag', line: lineAt(input, i) }
        const raw = input.slice(i, end + 1)
        const name = raw.slice(2, -1).trim().split(/\s/)[0] ?? ''
        if (!name) return { ok: false, error: 'Empty end tag', line: lineAt(input, i) }
        tokens.push({ kind: 'close', name, raw })
        i = end + 1
        continue
      }
      // open / self-closing
      const end = input.indexOf('>', i + 1)
      if (end < 0) return { ok: false, error: 'Unclosed start tag', line: lineAt(input, i) }
      const raw = input.slice(i, end + 1)
      const inner = raw.slice(1, -1).trim()
      const selfClosing = inner.endsWith('/')
      const namePart = (selfClosing ? inner.slice(0, -1) : inner).trim()
      const name = namePart.split(/\s/)[0] ?? ''
      if (!name || !/^[A-Za-z_:][\w:.-]*$/.test(name)) {
        return { ok: false, error: `Invalid tag name: ${name || '(empty)'}`, line: lineAt(input, i) }
      }
      tokens.push({ kind: 'open', name, raw: selfClosing ? raw : `<${namePart}>`, selfClosing })
      i = end + 1
      continue
    }
    const next = input.indexOf('<', i)
    const value = next < 0 ? input.slice(i) : input.slice(i, next)
    tokens.push({ kind: 'text', value })
    i = next < 0 ? n : next
  }
  return { ok: true, tokens }
}

function validateWellFormed(tokens: Token[]): MarkupResult {
  const stack: string[] = []
  for (const t of tokens) {
    if (t.kind === 'open' && !t.selfClosing) {
      stack.push(t.name)
    } else if (t.kind === 'close') {
      if (stack.length === 0) {
        return { ok: false, error: `Unexpected closing tag </${t.name}>` }
      }
      const open = stack.pop()!
      if (open !== t.name) {
        return {
          ok: false,
          error: `Mismatched tags: expected </${open}>, found </${t.name}>`
        }
      }
    }
  }
  if (stack.length > 0) {
    return { ok: false, error: `Unclosed tag <${stack[stack.length - 1]}>` }
  }
  return { ok: true, text: '' }
}

export function validateXml(input: string): MarkupResult {
  if (!input.trim()) return { ok: false, error: 'Empty input' }
  const tok = tokenizeXml(input)
  if (!tok.ok) return tok
  const v = validateWellFormed(tok.tokens)
  if (!v.ok) return v
  return { ok: true, text: input }
}

export function formatXml(
  input: string,
  options: { indent?: number; minify?: boolean } = {}
): MarkupResult {
  const tok = tokenizeXml(input)
  if (!tok.ok) return tok
  const v = validateWellFormed(tok.tokens)
  if (!v.ok) return v

  if (options.minify) {
    return { ok: true, text: minifyTokens(tok.tokens) }
  }

  const indentSize = options.indent ?? 2
  const pad = (level: number): string => ' '.repeat(Math.max(0, level) * indentSize)
  const lines: string[] = []
  let depth = 0

  for (const t of tok.tokens) {
    if (t.kind === 'text') {
      const trimmed = t.value.replace(/[ \t]+/g, ' ').replace(/\n+/g, '\n').trim()
      if (!trimmed) continue
      lines.push(pad(depth) + trimmed)
      continue
    }
    if (t.kind === 'close') {
      depth = Math.max(0, depth - 1)
      lines.push(pad(depth) + t.raw)
      continue
    }
    if (t.kind === 'open') {
      lines.push(pad(depth) + (t.selfClosing ? makeSelfClose(t) : t.raw))
      if (!t.selfClosing) depth += 1
      continue
    }
    // decl / comment / cdata
    lines.push(pad(depth) + t.value)
  }

  return { ok: true, text: lines.join('\n') + (lines.length ? '\n' : '') }
}

function makeSelfClose(t: Extract<Token, { kind: 'open' }>): string {
  if (t.raw.endsWith('/>') || t.raw.endsWith('/ >')) return t.raw.replace(/\s*\/\s*>$/, ' />')
  // normalize open that was marked selfClosing
  return t.raw.replace(/>$/, ' />')
}

function minifyTokens(tokens: Token[]): string {
  let out = ''
  for (const t of tokens) {
    if (t.kind === 'text') {
      const trimmed = t.value.replace(/\s+/g, ' ')
      if (trimmed.trim()) out += trimmed.trim()
      continue
    }
    if (t.kind === 'open') {
      out += t.selfClosing ? t.raw.replace(/\s*\/\s*>$/, '/>') : t.raw
      continue
    }
    if (t.kind === 'close') {
      out += t.raw
      continue
    }
    out += t.value
  }
  return out
}

export function minifyXml(input: string): MarkupResult {
  return formatXml(input, { minify: true })
}

/** Exported for HTML void-tag awareness if needed */
export { VOID_LIKE }
