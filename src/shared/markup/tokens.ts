export type MarkupFailure = { ok: false; error: string; line?: number; column?: number; offset?: number; hint?: string }
export type MarkupToken = {
  kind: 'open' | 'close' | 'text' | 'raw' | 'comment' | 'decl' | 'cdata'
  raw: string
  start: number
  end: number
  name?: string
  selfClosing?: boolean
}

export function markupError(input: string, offset: number, error: string, hint?: string): MarkupFailure {
  const lines = input.slice(0, offset).split(/\r\n|\r|\n/)
  return { ok: false, error, offset, line: lines.length, column: lines[lines.length - 1]!.length + 1, hint }
}

/** End of a tag, respecting quoted values and the internal subset of a DOCTYPE. */
export function tagEnd(input: string, start: number, doctype = false): number {
  let quote = ''
  let brackets = 0
  for (let i = start + 1; i < input.length; i++) {
    const char = input[i]!
    if (quote) { if (char === quote) quote = ''; continue }
    if (doctype && input.startsWith('<!--', i)) {
      const end = input.indexOf('-->', i + 4)
      if (end < 0) return -1
      i = end + 2
      continue
    }
    if (char === '"' || char === "'") { quote = char; continue }
    if (doctype && char === '[') brackets++
    else if (doctype && char === ']') brackets--
    else if (char === '>' && brackets === 0) return i
  }
  return -1
}

const HTML_BLOCK = new Set('html head body meta link base main section article aside nav header footer div p h1 h2 h3 h4 h5 h6 ul ol li dl dt dd table thead tbody tfoot tr td th form fieldset details summary dialog figure figcaption blockquote script style pre textarea title'.split(' '))

/** Indent only element-only regions. Protected subtrees are copied from source,
 * including their whitespace, comments, quoted attributes and raw text. */
export function renderMarkup(input: string, tokens: MarkupToken[], indent: number, minify: boolean, html = false): string {
  const stack: number[] = []
  const ends = new Map<number, number>()
  const protectedNodes = new Set<number>()
  const hasChildren = new Set<number>()
  const hasWhitespace = new Set<number>()
  let preserveFragment = false
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!
    const parent = stack[stack.length - 1]
    if (token.kind === 'open') {
      if (html && parent == null && !HTML_BLOCK.has(token.name!)) preserveFragment = true
      if (parent != null) {
        hasChildren.add(parent)
        if (html && !HTML_BLOCK.has(token.name!)) protectedNodes.add(parent)
      }
      if (/\bxml:space\s*=\s*(['"])preserve\1/.test(token.raw)) protectedNodes.add(i)
      if (html && /\bstyle\s*=\s*(['"])[^'"]*white-space\s*:\s*(?:pre|break-spaces)/i.test(token.raw)) protectedNodes.add(i)
      if (html && ['pre', 'code', 'script', 'style', 'textarea', 'title', 'xmp', 'iframe'].includes(token.name!)) protectedNodes.add(i)
      if (!token.selfClosing) stack.push(i)
    } else if (token.kind === 'close') {
      let matching = stack.length - 1
      while (matching >= 0 && tokens[stack[matching]!]!.name !== token.name) matching--
      if (matching >= 0) {
        const open = stack[matching]!
        // Omitted HTML closing tags: keep the affected subtree untouched.
        if (matching !== stack.length - 1) protectedNodes.add(open)
        ends.set(open, i)
        stack.length = matching
      }
    } else if (token.kind === 'raw' || token.kind === 'cdata' || (token.kind === 'text' && token.raw.trim())) {
      if (parent != null) protectedNodes.add(parent)
      else preserveFragment = true
    } else if (token.kind === 'text' && parent != null && token.raw.length) hasWhitespace.add(parent)
  }
  if (html && (stack.length || preserveFragment)) return input
  for (const index of hasWhitespace) if (!hasChildren.has(index)) protectedNodes.add(index)
  const chunks: string[] = []
  let depth = 0
  const pad = (): string => minify ? '' : ' '.repeat(Math.min(depth, 256) * indent)
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!
    if (token.kind === 'text' && !token.raw.trim()) continue
    const end = ends.get(i)
    if (protectedNodes.has(i) && end != null) {
      chunks.push(pad() + input.slice(token.start, tokens[end]!.end))
      i = end
      continue
    }
    if (token.kind === 'close') depth = Math.max(0, depth - 1)
    chunks.push(pad() + token.raw)
    if (token.kind === 'open' && !token.selfClosing) depth++
  }
  return (input.startsWith('\ufeff') ? '\ufeff' : '') + chunks.join(minify ? '' : '\n') + (!minify && chunks.length ? '\n' : '')
}
