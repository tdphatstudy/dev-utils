import type { MarkupResult } from '../xml'
import { markupError, renderMarkup, tagEnd, type MarkupFailure, type MarkupToken } from '../markup/tokens'

export type { MarkupResult }
const VOID = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '))
const OPTIONAL = new Set('html head body p li dt dd option optgroup tr td th thead tbody tfoot colgroup'.split(' '))
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe'])

function tokenizeHtml(input: string): { ok: true; tokens: MarkupToken[] } | MarkupFailure {
  const tokens: MarkupToken[] = []
  let i = 0
  let rawUntil: string | null = null
  while (i < input.length) {
    const start = i
    if (rawUntil) {
      const pattern = new RegExp(`</${rawUntil}(?=[\\x20\\t\\r\\n/>])`, 'ig')
      pattern.lastIndex = i
      const match = pattern.exec(input)
      if (!match) return markupError(input, tokens[tokens.length - 1]!.start, `Unclosed <${rawUntil}> element.`, `Add </${rawUntil}> after its content.`)
      if (match.index > i) tokens.push({ kind: 'raw', raw: input.slice(i, match.index), start: i, end: match.index })
      i = match.index
      rawUntil = null
      continue
    }
    if (input[i] !== '<' || !/^<(?:[A-Za-z]|\/|!)/.test(input.slice(i, i + 3))) {
      const next = input.indexOf('<', i + 1)
      i = next < 0 ? input.length : next
      tokens.push({ kind: 'text', raw: input.slice(start, i), start, end: i })
      continue
    }
    if (input.startsWith('<!--', i)) {
      const end = input.indexOf('-->', i + 4)
      if (end < 0) return markupError(input, i, 'Unclosed comment', 'Add --> to close it.')
      i = end + 3
      tokens.push({ kind: 'comment', raw: input.slice(start, i), start, end: i })
      continue
    }
    if (input.startsWith('<![CDATA[', i)) {
      const end = input.indexOf(']]>', i + 9)
      if (end < 0) return markupError(input, i, 'Unclosed CDATA section.', 'Add ]]> to close it.')
      i = end + 3
      tokens.push({ kind: 'cdata', raw: input.slice(start, i), start, end: i })
      continue
    }
    const end = tagEnd(input, i, /^<!doctype/i.test(input.slice(i, i + 10)))
    if (end < 0) return markupError(input, i, 'Unclosed tag or quoted attribute', 'Close quoted values and finish the tag with >.')
    i = end + 1
    const raw = input.slice(start, i)
    if (/^<!doctype(?:\s|>)/i.test(raw)) { tokens.push({ kind: 'decl', raw, start, end: i }); continue }
    if (raw.startsWith('<!')) return markupError(input, start, 'Unsupported HTML declaration.', 'Use <!DOCTYPE html> or <!-- comment -->.')
    const close = raw.startsWith('</')
    const body = raw.slice(close ? 2 : 1, -1)
    const name = body.match(/^[A-Za-z][^\x20\t\r\n\/>]*/)?.[0]?.toLowerCase()
    if (!name) return markupError(input, start, 'Invalid HTML tag name.')
    if (close && body.slice(name.length).trim()) return markupError(input, start, 'Closing tags cannot contain attributes.')
    const selfClosing = VOID.has(name) || /\/\s*>$/.test(raw)
    tokens.push({ kind: close ? 'close' : 'open', name, raw, start, end: i, selfClosing })
    if (!close && !selfClosing && RAW_TEXT.has(name)) rawUntil = name
  }
  return { ok: true, tokens }
}

function balance(input: string, tokens: MarkupToken[]): MarkupResult {
  const stack: MarkupToken[] = []
  for (const token of tokens) {
    if (token.kind === 'open' && !token.selfClosing) stack.push(token)
    else if (token.kind === 'close') {
      let matching = stack.length - 1
      while (matching >= 0 && stack[matching]!.name !== token.name) matching--
      if (matching < 0) {
        if (OPTIONAL.has(token.name!)) continue
        return markupError(input, token.start, `Unexpected closing tag </${token.name}>`, 'Add its opening tag or remove this closing tag.')
      }
      const unclosed = stack.slice(matching + 1).find((open) => !OPTIONAL.has(open.name!))
      if (unclosed) return markupError(input, token.start, `Expected </${unclosed.name}> before </${token.name}>`, `The <${unclosed.name}> tag starts on line ${markupError(input, unclosed.start, '').line}.`)
      stack.length = matching
    }
  }
  const unclosed = stack.find((token) => !OPTIONAL.has(token.name!))
  if (unclosed) return markupError(input, unclosed.start, `Unclosed <${unclosed.name}> element.`, `Add </${unclosed.name}> after its content.`)
  return { ok: true, text: input }
}

export function validateHtml(input: string): MarkupResult {
  if (!input.trim()) return { ok: false, error: 'Empty input' }
  const tokens = tokenizeHtml(input)
  return tokens.ok ? balance(input, tokens.tokens) : tokens
}

export function formatHtml(input: string, options: { indent?: number; minify?: boolean } = {}): MarkupResult {
  if (!input.trim()) return { ok: false, error: 'Empty input' }
  const tokens = tokenizeHtml(input)
  if (!tokens.ok) return tokens
  const checked = balance(input, tokens.tokens)
  if (!checked.ok) return checked
  const indent = options.indent ?? 2
  if (!Number.isInteger(indent) || indent < 0 || indent > 8) return { ok: false, error: 'Indent must be an integer from 0 to 8.' }
  return { ok: true, text: renderMarkup(input, tokens.tokens, indent, !!options.minify, true) }
}

export function minifyHtml(input: string): MarkupResult { return formatHtml(input, { minify: true }) }
