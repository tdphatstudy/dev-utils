import type { SshHostEntry, SshHostInput } from '@shared/ssh/types'

type Line = { raw: string; eol: string }
type Directive = { key: string; tokens: string[]; prefix: string; suffix: string; valid: boolean }
type Block = { start: number; end: number; host: SshHostEntry }
const fields = { hostname: 'hostName', user: 'user', port: 'port', identityfile: 'identityFile' } as const

function linesOf(text: string): Line[] {
  return Array.from(text.matchAll(/([^\r\n]*)(\r\n|\n|\r|$)/g))
    .filter((m) => m[0].length > 0).map((m) => ({ raw: m[1], eol: m[2] }))
}

/** Preserve raw lines; parse only the values needed for the form. */
function directive(raw: string): Directive | null {
  const match = /^(\uFEFF?\s*[A-Za-z][A-Za-z0-9]*)(?:\s*=\s*|\s+)(.*)$/.exec(raw)
  if (!match) return null
  const key = match[1].trim().toLowerCase()
  const prefix = raw.slice(0, raw.length - match[2].length)
  const value = match[2]
  const tokens: string[] = []
  let token = '', quoted = false, active = false, comment = value.length
  for (let i = 0; i < value.length; i++) {
    const c = value[i]
    if (c === '"') { quoted = !quoted; active = true }
    else if (c === '\\' && value[i + 1] === '"') { token += '"'; i++; active = true }
    else if (!quoted && c === '#') { comment = i; break }
    else if (!quoted && /\s/.test(c)) {
      if (active) { tokens.push(token); token = ''; active = false }
    } else { token += c; active = true }
  }
  if (active) tokens.push(token)
  const suffix = value.slice(0, comment).match(/\s*$/)![0] + value.slice(comment)
  return { key, tokens, prefix, suffix, valid: !quoted }
}

function blocksOf(lines: Line[]): Block[] {
  const blocks: Block[] = []
  let current: Block | null = null
  for (let i = 0; i < lines.length; i++) {
    const d = directive(lines[i].raw)
    if (!d) continue
    if (d.key === 'host' || d.key === 'match') {
      if (current) { current.end = i; blocks.push(current) }
      current = null
      if (d.key === 'host') current = { start: i, end: lines.length, host: {
        alias: d.tokens[0] ?? '', patterns: d.tokens, port: 22, options: Object.create(null),
        readOnlyReason: !d.valid || d.tokens.length !== 1 || /[*?!]/.test(d.tokens[0] ?? '')
          ? 'Pattern or multi-alias block: edit in your SSH config editor.' : undefined
      } }
      continue
    }
    if (!current) continue
    const h = current.host
    const value = d.tokens.join(' ')
    if (d.key === 'identityfile' && d.valid && d.tokens.length === 1) (h.identityFiles ??= []).push(value)
    if (!d.valid || (d.key in fields && d.tokens.length !== 1)) h.readOnlyReason = 'Unsupported value syntax: edit in your SSH config editor.'
    // OpenSSH scalar values use their first occurrence; IdentityFile can repeat.
    if (d.key === 'hostname' && h.hostName === undefined) h.hostName = value
    else if (d.key === 'user' && h.user === undefined) h.user = value
    else if (d.key === 'identityfile' && h.identityFile === undefined) h.identityFile = value
    else if (d.key === 'port' && !Object.hasOwn(h.options, 'port')) {
      h.options.port = value
      if (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 65535) h.port = Number(value)
      else h.readOnlyReason = 'Invalid Port directive: fix the config before editing.'
    } else if (!Object.hasOwn(h.options, d.key)) h.options[d.key] = value
  }
  if (current) blocks.push(current)
  for (const b of blocks) if (blocks.filter((other) => other.host.patterns.includes(b.host.alias)).length > 1) {
    b.host.readOnlyReason = 'Alias appears in multiple blocks: edit in your SSH config editor.'
  }
  return blocks
}

export function parseSshConfig(text: string): SshHostEntry[] {
  return blocksOf(linesOf(text)).map((b) => b.host)
}

function quoted(value: string): string {
  return /[\s#"]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value
}

export function hostFromInput(input: SshHostInput): SshHostEntry {
  if (!input || typeof input.alias !== 'string') throw new Error('Host alias is required.')
  const alias = input.alias.trim()
  if (!/^[A-Za-z0-9._-]{1,255}$/.test(alias)) throw new Error('Alias must use letters, digits, dot, underscore or hyphen (up to 255 characters).')
  for (const key of ['hostName', 'user', 'identityFile', 'originalAlias'] as const) {
    const value = input[key]
    if (value !== undefined && (typeof value !== 'string' || value.length > 4096 || /[\x00-\x1f\x7f]/.test(value))) throw new Error(`${key} must be a single line without control characters.`)
  }
  if (input.port !== undefined && (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535)) throw new Error('Port must be an integer from 1 to 65535.')
  return { alias, patterns: [alias], hostName: input.hostName?.trim() || undefined,
    user: input.user?.trim() || undefined, identityFile: input.identityFile?.trim() || undefined,
    port: input.port ?? 22, options: Object.create(null) }
}

export function serializeHostBlock(input: SshHostEntry | SshHostInput): string {
  const h = hostFromInput(input)
  const lines = [`Host ${h.alias}`]
  if (h.hostName) lines.push(`  HostName ${quoted(h.hostName)}`)
  if (h.user) lines.push(`  User ${quoted(h.user)}`)
  lines.push(`  Port ${h.port}`)
  if (h.identityFile) lines.push(`  IdentityFile ${quoted(h.identityFile)}`)
  return lines.join('\n')
}

/** Change one concrete block in place. Untouched bytes and section order survive. */
export function patchSshHostConfig(text: string, input: SshHostInput | null, originalAlias?: string): string {
  if (text.length > 2_000_000) throw new Error('SSH config exceeds the 2 MB editor limit.')
  const lines = linesOf(text), blocks = blocksOf(lines)
  const next = input ? hostFromInput(input) : null
  const alias = originalAlias ?? input?.originalAlias
  const matches = alias ? blocks.filter((b) => b.host.patterns.includes(alias)) : []
  if (alias && matches.length !== 1) throw new Error(matches.length ? 'Alias is ambiguous across multiple blocks.' : 'Host no longer exists. Refresh before editing.')
  const block = matches[0]
  if (block?.host.readOnlyReason) throw new Error(block.host.readOnlyReason)
  if (next && blocks.some((b) => b !== block && b.host.patterns.includes(next.alias))) throw new Error(`Host “${next.alias}” already exists`)
  const eol = lines.find((l) => l.eol)?.eol ?? '\n'
  if (!block) {
    if (!next) throw new Error('Alias required')
    // New specific hosts precede conditional defaults. Preamble is unchanged.
    const at = lines.findIndex((l) => { const d = directive(l.raw); return d?.key === 'host' || d?.key === 'match' })
    const index = at < 0 ? lines.length : at
    if (index > 0 && !lines[index - 1].eol) lines[index - 1].eol = eol
    lines.splice(index, 0, ...linesOf(serializeHostBlock(next).replace(/\n/g, eol) + eol + eol))
  } else if (!next) {
    // Comments and blank lines may describe the following block; preserve them.
    for (let i = block.end - 1; i >= block.start; i--) if (directive(lines[i].raw)) lines.splice(i, 1)
  } else {
    const header = directive(lines[block.start].raw)!
    if (next.alias !== block.host.alias) lines[block.start].raw = header.prefix + next.alias + header.suffix
    const additions: string[] = []
    for (const [key, field] of Object.entries(fields) as [keyof typeof fields, typeof fields[keyof typeof fields]][]) {
      if (next[field] === block.host[field]) continue
      const indices: number[] = []
      for (let i = block.start + 1; i < block.end; i++) if (directive(lines[i].raw)?.key === key) indices.push(i)
      if (indices.length > 1) throw new Error(`Repeated ${key} directives: edit this value in your SSH config editor.`)
      const value = next[field]
      if (indices.length) {
        const i = indices[0], d = directive(lines[i].raw)!
        lines[i].raw = value === undefined ? (d.suffix.trimStart().startsWith('#') ? lines[i].raw.match(/^\s*/)![0] + d.suffix.trimStart() : '') : d.prefix + quoted(String(value)) + d.suffix
      } else if (value !== undefined) additions.push(`  ${key === 'hostname' ? 'HostName' : key === 'identityfile' ? 'IdentityFile' : key === 'port' ? 'Port' : 'User'} ${quoted(String(value))}`)
    }
    // Place new directives before Includes/other options that may supply defaults.
    if (additions.length) {
      if (!lines[block.start].eol) lines[block.start].eol = eol
      lines.splice(block.start + 1, 0, ...additions.map((raw) => ({ raw, eol })))
    }
  }
  return lines.map((l) => l.raw + l.eol).join('')
}

/** Compatibility helper; production mutations use patchSshHostConfig directly. */
export function rewriteSshConfig(text: string, hosts: SshHostEntry[]): string {
  let out = text
  const original = parseSshConfig(text)
  for (const host of original) {
    const next = hosts.find((h) => h.alias === host.alias)
    if (host.readOnlyReason) continue
    out = patchSshHostConfig(out, next ?? null, host.alias)
  }
  for (const host of hosts) if (!original.some((h) => h.alias === host.alias)) out = patchSshHostConfig(out, host)
  return out
}
