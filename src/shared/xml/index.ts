import { markupError, renderMarkup, tagEnd, type MarkupFailure, type MarkupToken } from '../markup/tokens'

export type MarkupResult = { ok: true; text: string } | MarkupFailure
// XML 1.0 Fifth Edition NameStartChar / NameChar. No namespace normalization.
const NAME_START = ':A-Z_a-z\\u00c0-\\u00d6\\u00d8-\\u00f6\\u00f8-\\u02ff\\u0370-\\u037d\\u037f-\\u1fff\\u200c-\\u200d\\u2070-\\u218f\\u2c00-\\u2fef\\u3001-\\ud7ff\\uf900-\\ufdcf\\ufdf0-\\ufffd\\u{10000}-\\u{effff}'
const NAME = new RegExp(`^[${NAME_START}][${NAME_START}0-9.\\-\\u00b7\\u0300-\\u036f\\u203f-\\u2040]*$`, 'u')
const SPACE = /^[\x20\t\r\n]+/

function tokenizeXml(input: string): { ok: true; tokens: MarkupToken[] } | MarkupFailure {
  const tokens: MarkupToken[] = []
  let i = input.startsWith('\ufeff') ? 1 : 0
  const failure = (offset: number, error: string, hint?: string): MarkupFailure => markupError(input, offset, error, hint)
  while (i < input.length) {
    const start = i
    if (input[i] !== '<') {
      const next = input.indexOf('<', i)
      i = next < 0 ? input.length : next
      tokens.push({ kind: 'text', raw: input.slice(start, i), start, end: i })
      continue
    }
    let kind: MarkupToken['kind'] = 'open'
    let end: number
    if (input.startsWith('<!--', i)) {
      end = input.indexOf('-->', i + 4)
      if (end < 0) return failure(i, 'Unclosed comment', 'Add --> to close the comment.')
      if (input.slice(i + 4, end).includes('--') || input[end - 1] === '-') return failure(i, 'XML comments cannot contain -- or end with a hyphen.')
      end += 2; kind = 'comment'
    } else if (input.startsWith('<![CDATA[', i)) {
      end = input.indexOf(']]>', i + 9)
      if (end < 0) return failure(i, 'Unclosed CDATA', 'Add ]]> to close this section.')
      end += 2; kind = 'cdata'
    } else if (input.startsWith('<?', i)) {
      end = input.indexOf('?>', i + 2)
      if (end < 0) return failure(i, 'Unclosed processing instruction', 'Use ?> to close the instruction.')
      end++; kind = 'decl'
    } else if (input.startsWith('<!DOCTYPE', i)) {
      end = tagEnd(input, i, true); kind = 'decl'
    } else {
      end = tagEnd(input, i)
      if (input.startsWith('</', i)) kind = 'close'
    }
    if (end < 0) return failure(i, 'Unclosed tag or quoted attribute', 'Close every quoted value and finish the tag with >.')
    i = end + 1
    const raw = input.slice(start, i)
    const token: MarkupToken = { kind, raw, start, end: i }
    if (kind === 'open' || kind === 'close') {
      const body = raw.slice(kind === 'open' ? 1 : 2, -1)
      const name = body.match(/^[^\x20\t\r\n\/>]+/)?.[0] ?? ''
      if (!NAME.test(name)) return failure(start + (kind === 'open' ? 1 : 2), 'Invalid XML tag name', 'Start a name with a letter, underscore or a valid XML name character.')
      token.name = name
      if (kind === 'close') {
        if (body.slice(name.length).trim()) return failure(start, 'Closing tags cannot contain attributes.')
      } else {
        let position = name.length
        const attrs = new Set<string>()
        while (position < body.length) {
          const space = SPACE.exec(body.slice(position))?.[0] ?? ''
          position += space.length
          if (position === body.length) break
          if (body[position] === '/' && position === body.length - 1) { token.selfClosing = true; position++; break }
          const attributeOffset = start + 1 + position
          if (!space) return failure(attributeOffset, 'Expected whitespace between XML attributes.')
          const match = /^([^\x20\t\r\n=]+)[\x20\t\r\n]*=[\x20\t\r\n]*(['"])([\s\S]*?)\2/.exec(body.slice(position))
          if (!match || !NAME.test(match[1]!)) return failure(attributeOffset, 'Invalid attribute: use name="value" with a quoted value.')
          if (attrs.has(match[1]!)) return failure(attributeOffset, `Duplicate attribute ${match[1]}`)
          attrs.add(match[1]!)
          if (match[3]!.includes('<')) return failure(attributeOffset, 'Attribute values cannot contain a literal <.', 'Use &lt; instead.')
          position += match[0].length
        }
      }
    }
    tokens.push(token)
  }
  return { ok: true, tokens }
}

function structure(input: string, tokens: MarkupToken[]): MarkupResult {
  const stack: MarkupToken[] = []
  let roots = 0
  let doctype = false
  for (const token of tokens) {
    if (token.kind === 'open') {
      if (!stack.length && ++roots > 1) return markupError(input, token.start, 'XML must contain exactly one root element.', 'Wrap these elements in one parent element.')
      if (!token.selfClosing) stack.push(token)
    } else if (token.kind === 'close') {
      const open = stack.pop()
      if (!open) return markupError(input, token.start, `Unexpected closing tag </${token.name}>`)
      if (open.name !== token.name) return markupError(input, token.start, `Mismatched tags: expected </${open.name}>, found </${token.name}>`, `Match the tag opened on line ${markupError(input, open.start, '').line}.`)
    } else if ((token.kind === 'text' && token.raw.trim()) || token.kind === 'cdata') {
      if (!stack.length) return markupError(input, token.start, 'Text and CDATA must be inside the root element.')
      if (token.kind === 'text' && token.raw.includes(']]>')) return markupError(input, token.start + token.raw.indexOf(']]>'), 'The sequence ]]> is only allowed to end a CDATA section.')
    } else if (token.kind === 'decl' && token.raw.startsWith('<!DOCTYPE')) {
      if (doctype || roots || stack.length) return markupError(input, token.start, 'DOCTYPE must occur once, before the root element.')
      doctype = true
    }
  }
  if (stack.length) { const open = stack[stack.length - 1]!; return markupError(input, open.start, `Unclosed tag <${open.name}>`, `Add </${open.name}> before closing its parent.`) }
  if (!roots) return markupError(input, input.length, 'XML requires a root element.')
  return { ok: true, text: input }
}

/** Structural check; renderer also uses the platform XML parser for entities and namespaces. */
export function validateXml(input: string): MarkupResult {
  if (!input.trim()) return { ok: false, error: 'Empty input' }
  const result = tokenizeXml(input)
  return result.ok ? structure(input, result.tokens) : result
}

export function formatXml(input: string, options: { indent?: number; minify?: boolean } = {}): MarkupResult {
  const result = tokenizeXml(input)
  if (!result.ok) return result
  const checked = structure(input, result.tokens)
  if (!checked.ok) return checked
  const indent = options.indent ?? 2
  if (!Number.isInteger(indent) || indent < 0 || indent > 8) return { ok: false, error: 'Indent must be an integer from 0 to 8.' }
  return { ok: true, text: renderMarkup(input, result.tokens, indent, !!options.minify) }
}

export function minifyXml(input: string): MarkupResult { return formatXml(input, { minify: true }) }
