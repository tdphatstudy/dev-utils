import type { MarkupResult } from '../xml'

export type { MarkupResult }

const VOID = new Set([
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

const RAW_TEXT = new Set(['script', 'style', 'pre', 'textarea', 'code'])

type Token =
  | { kind: 'doctype'; value: string }
  | { kind: 'comment'; value: string }
  | { kind: 'open'; name: string; raw: string; selfClosing: boolean }
  | { kind: 'close'; name: string; raw: string }
  | { kind: 'text'; value: string }
  | { kind: 'raw'; value: string }

function lineAt(input: string, index: number): number {
  return input.slice(0, index).split(/\n/).length
}

function tokenizeHtml(input: string): { ok: true; tokens: Token[] } | MarkupResult {
  const tokens: Token[] = []
  let i = 0
  const n = input.length
  let rawUntil: string | null = null

  while (i < n) {
    if (rawUntil) {
      const close = `</${rawUntil}`
      const idx = input.toLowerCase().indexOf(close, i)
      if (idx < 0) {
        tokens.push({ kind: 'raw', value: input.slice(i) })
        i = n
        rawUntil = null
        continue
      }
      if (idx > i) tokens.push({ kind: 'raw', value: input.slice(i, idx) })
      // close tag handled next loop
      rawUntil = null
      i = idx
      continue
    }

    if (input[i] === '<') {
      if (input.startsWith('<!--', i)) {
        const end = input.indexOf('-->', i + 4)
        if (end < 0) return { ok: false, error: 'Unclosed comment', line: lineAt(input, i) }
        tokens.push({ kind: 'comment', value: input.slice(i, end + 3) })
        i = end + 3
        continue
      }
      if (/^<!doctype/i.test(input.slice(i, i + 10))) {
        const end = input.indexOf('>', i + 2)
        if (end < 0) return { ok: false, error: 'Unclosed doctype', line: lineAt(input, i) }
        tokens.push({ kind: 'doctype', value: input.slice(i, end + 1) })
        i = end + 1
        continue
      }
      if (input.startsWith('</', i)) {
        const end = input.indexOf('>', i + 2)
        if (end < 0) return { ok: false, error: 'Unclosed end tag', line: lineAt(input, i) }
        const raw = input.slice(i, end + 1)
        const name = (raw.slice(2, -1).trim().split(/\s/)[0] ?? '').toLowerCase()
        if (!name) return { ok: false, error: 'Empty end tag', line: lineAt(input, i) }
        tokens.push({ kind: 'close', name, raw: `</${name}>` })
        i = end + 1
        continue
      }
      const end = input.indexOf('>', i + 1)
      if (end < 0) return { ok: false, error: 'Unclosed start tag', line: lineAt(input, i) }
      const raw = input.slice(i, end + 1)
      const inner = raw.slice(1, -1).trim()
      const selfClosingSlash = /\/\s*$/.test(inner)
      const namePart = selfClosingSlash ? inner.replace(/\/\s*$/, '').trim() : inner
      const name = (namePart.split(/\s/)[0] ?? '').toLowerCase()
      if (!name) return { ok: false, error: 'Empty start tag', line: lineAt(input, i) }
      const isVoid = VOID.has(name) || selfClosingSlash
      tokens.push({
        kind: 'open',
        name,
        raw: isVoid && !selfClosingSlash ? `<${namePart}>` : raw,
        selfClosing: isVoid
      })
      if (!isVoid && RAW_TEXT.has(name)) rawUntil = name
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

function balanceCheck(tokens: Token[]): MarkupResult {
  const stack: string[] = []
  for (const t of tokens) {
    if (t.kind === 'open' && !t.selfClosing) stack.push(t.name)
    else if (t.kind === 'close') {
      // HTML is forgiving: allow closing optional parents loosely — still flag hard mismatches
      if (stack.length === 0) {
        // ignore stray closes for optional html/body/head/p/li
        if (['html', 'body', 'head', 'p', 'li', 'dt', 'dd', 'option', 'tr', 'td', 'th'].includes(t.name)) {
          continue
        }
        return { ok: false, error: `Unexpected closing tag </${t.name}>` }
      }
      // pop until match (HTML optional end tags)
      let found = false
      for (let s = stack.length - 1; s >= 0; s--) {
        if (stack[s] === t.name) {
          stack.length = s
          found = true
          break
        }
      }
      if (!found) {
        return { ok: false, error: `Mismatched or unexpected </${t.name}>` }
      }
    }
  }
  // leftover open tags are OK for HTML (optional closes) but report if many unclosed custom-ish
  return { ok: true, text: '' }
}

export function validateHtml(input: string): MarkupResult {
  if (!input.trim()) return { ok: false, error: 'Empty input' }
  const tok = tokenizeHtml(input)
  if (!('tokens' in tok)) return tok
  const bal = balanceCheck(tok.tokens)
  if (!bal.ok) return bal
  return { ok: true, text: input }
}

export function formatHtml(
  input: string,
  options: { indent?: number; minify?: boolean } = {}
): MarkupResult {
  const tok = tokenizeHtml(input)
  if (!('tokens' in tok)) return tok
  const bal = balanceCheck(tok.tokens)
  if (!bal.ok) return bal

  if (options.minify) {
    return { ok: true, text: minifyHtmlTokens(tok.tokens) }
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
    if (t.kind === 'raw') {
      // keep raw block content indented once under parent
      const content = t.value.replace(/^\n+|\n+$/g, '')
      if (content) {
        for (const line of content.split('\n')) {
          lines.push(pad(depth) + line)
        }
      }
      continue
    }
    if (t.kind === 'close') {
      depth = Math.max(0, depth - 1)
      lines.push(pad(depth) + t.raw)
      continue
    }
    if (t.kind === 'open') {
      lines.push(pad(depth) + t.raw)
      if (!t.selfClosing) depth += 1
      continue
    }
    lines.push(pad(depth) + t.value)
  }

  return { ok: true, text: lines.join('\n') + (lines.length ? '\n' : '') }
}

function minifyHtmlTokens(tokens: Token[]): string {
  let out = ''
  for (const t of tokens) {
    if (t.kind === 'text') {
      const s = t.value.replace(/\s+/g, ' ')
      if (s.trim()) out += s
      continue
    }
    if (t.kind === 'raw') {
      out += t.value
      continue
    }
    if (t.kind === 'open' || t.kind === 'close') {
      out += t.raw
      continue
    }
    out += t.value
  }
  return out.replace(/>\s+</g, '><').trim()
}

export function minifyHtml(input: string): MarkupResult {
  return formatHtml(input, { minify: true })
}
