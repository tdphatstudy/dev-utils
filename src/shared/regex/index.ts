/**
 * Local regex toolkit — JS RegExp (ECMAScript) semantics.
 */

export type RegexFlag = 'g' | 'i' | 'm' | 's' | 'u' | 'y' | 'd' | 'v'

export const REGEX_FLAGS: {
  flag: RegexFlag
  label: string
  description: string
}[] = [
  { flag: 'g', label: 'Global', description: 'Find all matches (not only the first)' },
  { flag: 'i', label: 'Ignore case', description: 'Case-insensitive matching' },
  { flag: 'm', label: 'Multiline', description: '^ and $ match line boundaries' },
  { flag: 's', label: 'DotAll', description: '. matches newline characters' },
  { flag: 'u', label: 'Unicode', description: 'Unicode code-point mode' },
  { flag: 'v', label: 'Unicode sets', description: 'Unicode sets mode (ES2024)' },
  { flag: 'y', label: 'Sticky', description: 'Match only at lastIndex' },
  { flag: 'd', label: 'Indices', description: 'Include start/end indices of groups' }
]

export interface RegexMatch {
  index: number
  end: number
  match: string
  groups: (string | undefined)[]
  namedGroups: Record<string, string | undefined>
  indices?: { start: number; end: number }[]
  namedIndices?: Record<string, { start: number; end: number } | undefined>
}

export interface RegexTestOk {
  ok: true
  pattern: string
  flags: string
  matches: RegexMatch[]
  matchCount: number
}

export interface RegexTestErr {
  ok: false
  error: string
}

export type RegexTestResult = RegexTestOk | RegexTestErr

export interface RegexReplaceResult {
  ok: true
  result: string
  count: number
}

export interface RegexSplitResult {
  ok: true
  parts: (string | undefined)[]
}

export interface RegexToken {
  raw: string
  kind:
    | 'literal'
    | 'metachar'
    | 'quantifier'
    | 'group'
    | 'class'
    | 'anchor'
    | 'escape'
    | 'alternation'
    | 'other'
  meaning: string
}

export const REGEX_CHEATSHEET: { category: string; rows: { token: string; meaning: string }[] }[] =
  [
    {
      category: 'Character classes',
      rows: [
        { token: '.', meaning: 'Any character (except newline unless s)' },
        { token: '\\d', meaning: 'Digit [0-9]' },
        { token: '\\D', meaning: 'Non-digit' },
        { token: '\\w', meaning: 'Word char [A-Za-z0-9_]' },
        { token: '\\W', meaning: 'Non-word char' },
        { token: '\\s', meaning: 'Whitespace' },
        { token: '\\S', meaning: 'Non-whitespace' },
        { token: '[abc]', meaning: 'One of a, b, or c' },
        { token: '[^abc]', meaning: 'Not a, b, or c' },
        { token: '[a-z]', meaning: 'Range a to z' }
      ]
    },
    {
      category: 'Anchors',
      rows: [
        { token: '^', meaning: 'Start of string (or line with m)' },
        { token: '$', meaning: 'End of string (or line with m)' },
        { token: '\\b', meaning: 'Word boundary' },
        { token: '\\B', meaning: 'Not word boundary' }
      ]
    },
    {
      category: 'Quantifiers',
      rows: [
        { token: '*', meaning: '0 or more' },
        { token: '+', meaning: '1 or more' },
        { token: '?', meaning: '0 or 1' },
        { token: '{n}', meaning: 'Exactly n' },
        { token: '{n,}', meaning: 'n or more' },
        { token: '{n,m}', meaning: 'Between n and m' },
        { token: '*?', meaning: 'Lazy 0 or more' },
        { token: '+?', meaning: 'Lazy 1 or more' }
      ]
    },
    {
      category: 'Groups & lookaround',
      rows: [
        { token: '(...)', meaning: 'Capturing group' },
        { token: '(?:...)', meaning: 'Non-capturing group' },
        { token: '(?<name>...)', meaning: 'Named capturing group' },
        { token: '\\1 / $1', meaning: 'Backreference / replace group 1' },
        { token: '(?=...)', meaning: 'Positive lookahead' },
        { token: '(?!...)', meaning: 'Negative lookahead' },
        { token: '(?<=...)', meaning: 'Positive lookbehind' },
        { token: '(?<!...)', meaning: 'Negative lookbehind' }
      ]
    },
    {
      category: 'Alternation & escape',
      rows: [
        { token: 'a|b', meaning: 'a or b' },
        { token: '\\', meaning: 'Escape next metacharacter' },
        { token: '\\n \\t', meaning: 'Newline / tab' },
        { token: '\\uXXXX', meaning: 'Unicode code unit (with u flag)' }
      ]
    }
  ]

export const REGEX_SAMPLES: { label: string; pattern: string; flags: string; text: string }[] = [
  {
    label: 'Email (simple)',
    pattern: '[\\w.+-]+@[\\w-]+\\.[\\w.-]+',
    flags: 'g',
    text: 'Contact us@example.com or admin@test.co.uk for help.'
  },
  {
    label: 'URL',
    pattern: 'https?:\\/\\/[^\\s]+',
    flags: 'g',
    text: 'Docs: https://example.com/a and http://localhost:3000/x'
  },
  {
    label: 'ISO date',
    pattern: '\\d{4}-\\d{2}-\\d{2}',
    flags: 'g',
    text: 'Released 2024-01-15, patched 2024-03-02.'
  },
  {
    label: 'IPv4',
    pattern: '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b',
    flags: 'g',
    text: 'Server 192.168.0.1 and 10.0.0.42 online.'
  },
  {
    label: 'Named groups',
    pattern: '(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})',
    flags: 'g',
    text: 'Date: 2026-07-25'
  },
  {
    label: 'Quoted strings',
    pattern: '"(?:\\\\.|[^"\\\\])*"',
    flags: 'g',
    text: 'a = "hello \\"world\\""; b = "x";'
  }
]

export function normalizeFlags(flags: string): string {
  const allowed = new Set(REGEX_FLAGS.map((f) => f.flag))
  const seen = new Set<string>()
  let out = ''
  for (const ch of flags) {
    if (!allowed.has(ch as RegexFlag)) continue
    if (seen.has(ch)) continue
    // u and v are mutually exclusive in engines that support both
    if (ch === 'v' && seen.has('u')) continue
    if (ch === 'u' && seen.has('v')) continue
    seen.add(ch)
    out += ch
  }
  return out
}

export function buildRegExp(pattern: string, flags: string): { ok: true; re: RegExp } | RegexTestErr {
  const seen = new Set<string>()
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i]!
    if (!REGEX_FLAGS.some((entry) => entry.flag === flag)) return { ok: false, error: `Unknown flag “${flag}” at column ${i + 1}. Use g i m s u v y d.` }
    if (seen.has(flag)) return { ok: false, error: `Duplicate flag “${flag}” at column ${i + 1}.` }
    seen.add(flag)
  }
  if (seen.has('u') && seen.has('v')) return { ok: false, error: 'Flags u and v cannot be used together. Choose one Unicode mode.' }
  try {
    return { ok: true, re: new RegExp(pattern, flags) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid regular expression' }
  }
}

export function testRegex(pattern: string, flags: string, text: string, maxMatches = 50_000): RegexTestResult {
  const built = buildRegExp(pattern, flags)
  if (!built.ok) return built
  const re = built.re
  const hasG = re.global
  const hasD = re.hasIndices
  const matches: RegexMatch[] = []

  if (hasG) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    let guard = 0
    while ((m = re.exec(text)) !== null) {
      guard++
      if (guard > maxMatches) {
        return { ok: false, error: `More than ${maxMatches} matches. Narrow the pattern or reduce the test string.` }
      }
      matches.push(matchFromExec(m, hasD))
      if (m[0] === '') {
        // Avoid infinite loop on zero-length matches
        const unicode = re.unicode || re.flags.includes('v')
        const code = text.codePointAt(m.index)
        re.lastIndex = m.index + (unicode && code !== undefined && code > 0xffff ? 2 : 1)
      }
    }
  } else {
    const m = re.exec(text)
    if (m) matches.push(matchFromExec(m, hasD))
  }

  return {
    ok: true,
    pattern,
    flags: normalizeFlags(flags),
    matches,
    matchCount: matches.length
  }
}

function matchFromExec(m: RegExpExecArray, hasD: boolean): RegexMatch {
  const groups = m.slice(1) as (string | undefined)[]
  const namedGroups: RegexMatch['namedGroups'] = Object.assign(Object.create(null), m.groups ?? {})
  const index = m.index
  const end = index + m[0].length
  const row: RegexMatch = {
    index,
    end,
    match: m[0],
    groups,
    namedGroups
  }
  if (hasD && m.indices) {
    row.indices = m.indices.map((pair) =>
      pair ? { start: pair[0], end: pair[1] } : { start: -1, end: -1 }
    )
    if (m.indices.groups) {
      const namedIndices: NonNullable<RegexMatch['namedIndices']> = Object.create(null)
      row.namedIndices = namedIndices
      for (const [k, v] of Object.entries(m.indices.groups)) {
        namedIndices[k] = v ? { start: v[0], end: v[1] } : undefined
      }
    }
  }
  return row
}

export function replaceRegex(
  pattern: string,
  flags: string,
  text: string,
  replacement: string
): RegexReplaceResult | RegexTestErr {
  const built = buildRegExp(pattern, flags)
  if (!built.ok) return built
  // Count matches first
  const tested = testRegex(pattern, flags, text)
  if (!tested.ok) return tested
  // Expand substitutions in bounded pieces instead of allocating an amplified result.
  const chunks: string[] = []
  let length = 0
  const append = (piece: string): void => {
    length += piece.length
    if (length > 5_000_000) throw new Error('Replacement exceeds 5,000,000 UTF-16 units. Reduce the input or replacement.')
    chunks.push(piece)
  }
  let cursor = 0
  try {
    for (const match of tested.matches) {
      append(text.slice(cursor, match.index))
      let literalStart = 0
      for (let i = 0; i < replacement.length; i++) {
        if (replacement[i] !== '$') continue
        const token = replacement[i + 1]
        let value: string | undefined
        let consumed = 2
        if (token === '$') value = '$'
        else if (token === '&') value = match.match
        else if (token === '`') value = text.slice(0, match.index)
        else if (token === "'") value = text.slice(match.end)
        else if (token && /\d/.test(token)) {
          let number = Number(token)
          const next = replacement[i + 2]
          if (next && /\d/.test(next) && Number(token + next) > 0 && Number(token + next) <= match.groups.length) {
            number = Number(token + next); consumed = 3
          }
          if (number > 0 && number <= match.groups.length) value = match.groups[number - 1] ?? ''
        } else if (token === '<' && match.groups.length && Object.keys(match.namedGroups).length) {
          const end = replacement.indexOf('>', i + 2)
          if (end !== -1) { value = match.namedGroups[replacement.slice(i + 2, end)] ?? ''; consumed = end - i + 1 }
        }
        if (value === undefined) continue
        append(replacement.slice(literalStart, i))
        append(value)
        i += consumed - 1
        literalStart = i + 1
      }
      append(replacement.slice(literalStart))
      cursor = match.end
    }
    append(text.slice(cursor))
    return { ok: true, result: chunks.join(''), count: tested.matchCount }
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Replacement failed' } }
}

export function splitRegex(
  pattern: string,
  flags: string,
  text: string,
  limit?: number
): RegexSplitResult | RegexTestErr {
  const built = buildRegExp(pattern, flags)
  if (!built.ok) return built
  const parts =
    limit != null ? text.split(built.re, limit) : text.split(built.re)
  return { ok: true, parts }
}

/** Lightweight pattern tokenizer for an “explain” panel. */
export function explainRegex(pattern: string): RegexToken[] {
  const tokens: RegexToken[] = []
  let i = 0
  while (i < pattern.length) {
    const ch = pattern[i]!

    if (ch === '\\' && i + 1 < pattern.length) {
      const n = pattern[i + 1]!
      const pair = ch + n
      const meaning = escapeMeaning(n)
      tokens.push({ raw: pair, kind: 'escape', meaning })
      i += 2
      continue
    }

    if (ch === '[') {
      let j = i + 1
      let raw = '['
      if (pattern[j] === '^') {
        raw += '^'
        j++
      }
      while (j < pattern.length && pattern[j] !== ']') {
        if (pattern[j] === '\\' && j + 1 < pattern.length) {
          raw += pattern[j]! + pattern[j + 1]!
          j += 2
        } else {
          raw += pattern[j]
          j++
        }
      }
      if (j < pattern.length) {
        raw += ']'
        j++
      }
      tokens.push({
        raw,
        kind: 'class',
        meaning: raw.startsWith('[^') ? 'Negated character class' : 'Character class'
      })
      i = j
      continue
    }

    if (ch === '(') {
      let kindLabel = 'Capturing group'
      let raw = '('
      let j = i + 1
      if (pattern.startsWith('?:', j)) {
        kindLabel = 'Non-capturing group'
        raw += '?:'
        j += 2
      } else if (pattern.startsWith('?=', j)) {
        kindLabel = 'Positive lookahead'
        raw += '?='
        j += 2
      } else if (pattern.startsWith('?!', j)) {
        kindLabel = 'Negative lookahead'
        raw += '?!'
        j += 2
      } else if (pattern.startsWith('?<=', j)) {
        kindLabel = 'Positive lookbehind'
        raw += '?<='
        j += 3
      } else if (pattern.startsWith('?<!', j)) {
        kindLabel = 'Negative lookbehind'
        raw += '?<!'
        j += 3
      } else if (pattern.startsWith('?<', j)) {
        const m = /^\(\?<([^>]+)>/.exec(pattern.slice(i))
        if (m) {
          kindLabel = `Named group "${m[1]}"`
          raw = m[0]
          j = i + raw.length
        }
      }
      tokens.push({ raw, kind: 'group', meaning: kindLabel })
      i = j
      continue
    }

    if (ch === ')') {
      tokens.push({ raw: ')', kind: 'group', meaning: 'End group' })
      i++
      continue
    }

    if (ch === '^' || ch === '$') {
      tokens.push({
        raw: ch,
        kind: 'anchor',
        meaning: ch === '^' ? 'Start anchor' : 'End anchor'
      })
      i++
      continue
    }

    if (ch === '|' ) {
      tokens.push({ raw: '|', kind: 'alternation', meaning: 'Alternation (OR)' })
      i++
      continue
    }

    if (ch === '*' || ch === '+' || ch === '?') {
      let raw = ch
      let meaning =
        ch === '*' ? '0 or more' : ch === '+' ? '1 or more' : '0 or 1'
      if (pattern[i + 1] === '?') {
        raw += '?'
        meaning = 'Lazy ' + meaning
        i++
      } else if (pattern[i + 1] === '+') {
        raw += '+'
        meaning = 'Possessive ' + meaning + ' (not supported in JS)'
        i++
      }
      tokens.push({ raw, kind: 'quantifier', meaning })
      i++
      continue
    }

    if (ch === '{') {
      const m = /^\{(\d+)(,(\d*))?\}/.exec(pattern.slice(i))
      if (m) {
        let raw = m[0]
        let meaning = `Exactly ${m[1]}`
        if (m[2] != null) {
          meaning = m[3] ? `Between ${m[1]} and ${m[3]}` : `${m[1]} or more`
        }
        if (pattern[i + raw.length] === '?') {
          raw += '?'
          meaning = 'Lazy ' + meaning
        }
        tokens.push({ raw, kind: 'quantifier', meaning })
        i += raw.length
        continue
      }
    }

    if (ch === '.') {
      tokens.push({ raw: '.', kind: 'metachar', meaning: 'Any character' })
      i++
      continue
    }

    // literal run
    let j = i
    let lit = ''
    while (j < pattern.length && !isMetaStart(pattern[j]!)) {
      lit += pattern[j]
      j++
    }
    if (lit) {
      tokens.push({ raw: lit, kind: 'literal', meaning: `Literal “${lit}”` })
      i = j
      continue
    }

    tokens.push({ raw: ch, kind: 'other', meaning: 'Symbol' })
    i++
  }
  return tokens
}

function isMetaStart(ch: string): boolean {
  return '.*+?^${}()|[]\\'.includes(ch)
}

function escapeMeaning(n: string): string {
  switch (n) {
    case 'd':
      return 'Digit'
    case 'D':
      return 'Non-digit'
    case 'w':
      return 'Word character'
    case 'W':
      return 'Non-word character'
    case 's':
      return 'Whitespace'
    case 'S':
      return 'Non-whitespace'
    case 'b':
      return 'Word boundary'
    case 'B':
      return 'Not word boundary'
    case 'n':
      return 'Newline'
    case 't':
      return 'Tab'
    case 'r':
      return 'Carriage return'
    case '0':
      return 'NUL'
    default:
      if (/^\d$/.test(n)) return `Backreference \\${n}`
      return `Escaped “${n}”`
  }
}

export function matchesToJson(result: RegexTestOk): string {
  return JSON.stringify(
    {
      pattern: result.pattern,
      flags: result.flags,
      matchCount: result.matchCount,
      matches: result.matches
    },
    null,
    2
  )
}

/** Build segments for highlighted preview: { text, match? } */
export function highlightSegments(
  text: string,
  matches: RegexMatch[]
): { text: string; hit: boolean; matchIndex?: number }[] {
  if (!matches.length) return [{ text, hit: false }]
  const sorted = [...matches].sort((a, b) => a.index - b.index)
  const segs: { text: string; hit: boolean; matchIndex?: number }[] = []
  let cursor = 0
  sorted.forEach((m, i) => {
    if (m.index > cursor) {
      segs.push({ text: text.slice(cursor, m.index), hit: false })
    }
    // Skip overlapping
    if (m.index < cursor) return
    segs.push({ text: text.slice(m.index, m.end), hit: true, matchIndex: i })
    cursor = m.end
  })
  if (cursor < text.length) segs.push({ text: text.slice(cursor), hit: false })
  return segs
}
