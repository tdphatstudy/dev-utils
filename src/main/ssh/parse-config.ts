import type { SshHostEntry, SshHostInput } from '@shared/ssh/types'

/**
 * Minimal OpenSSH config parser for Host blocks (HostName, User, Port, IdentityFile).
 * Does not expand Include / Match fully — good enough for local manager UI.
 */
export function parseSshConfig(text: string): SshHostEntry[] {
  const hosts: SshHostEntry[] = []
  let current: SshHostEntry | null = null

  const flush = (): void => {
    if (current && current.patterns.length > 0) {
      hosts.push(current)
    }
    current = null
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim()
    if (!line) continue

    const m = /^(\S+)\s+(.+)$/.exec(line)
    if (!m) continue
    const key = m[1]!.toLowerCase()
    const value = m[2]!.trim().replace(/^["']|["']$/g, '')

    if (key === 'host') {
      flush()
      const patterns = value.split(/\s+/).filter(Boolean)
      current = {
        alias: patterns[0] ?? value,
        patterns,
        port: 22,
        options: {}
      }
      continue
    }

    if (!current) continue

    if (key === 'hostname') current.hostName = value
    else if (key === 'user') current.user = value
    else if (key === 'port') {
      const p = Number(value)
      if (Number.isFinite(p) && p > 0 && p < 65536) current.port = p
    } else if (key === 'identityfile') current.identityFile = value
    else current.options[key] = value
  }
  flush()

  return hosts.filter(
    (h) => !(h.patterns.length === 1 && h.patterns[0] === '*' && !h.hostName)
  )
}

/** Serialize a Host block (indent with 2 spaces). */
export function serializeHostBlock(h: SshHostEntry | SshHostInput): string {
  const patterns =
    'patterns' in h && h.patterns?.length
      ? h.patterns
      : [h.alias.trim()]
  const lines: string[] = [`Host ${patterns.join(' ')}`]
  if (h.hostName?.trim()) lines.push(`  HostName ${h.hostName.trim()}`)
  if (h.user?.trim()) lines.push(`  User ${h.user.trim()}`)
  const port = h.port && h.port > 0 ? h.port : 22
  if (port !== 22) lines.push(`  Port ${port}`)
  if (h.identityFile?.trim()) lines.push(`  IdentityFile ${h.identityFile.trim()}`)
  if ('options' in h && h.options) {
    for (const [k, v] of Object.entries(h.options)) {
      if (!v) continue
      const key = k.charAt(0).toUpperCase() + k.slice(1)
      lines.push(`  ${key} ${v}`)
    }
  }
  return lines.join('\n')
}

/**
 * Rebuild config file: keep non-Host preamble / Host * blocks, replace managed Hosts.
 */
export function rewriteSshConfig(
  existingText: string,
  hosts: SshHostEntry[]
): string {
  const lines = existingText.split(/\r?\n/)
  const kept: string[] = []
  let i = 0
  let inHostBlock = false
  let currentHostPatterns: string[] = []

  const isManagedHost = (patterns: string[]): boolean => {
    // Host * alone = global defaults → keep in preamble section as "kept"
    if (patterns.length === 1 && patterns[0] === '*') return false
    return true
  }

  while (i < lines.length) {
    const raw = lines[i]!
    const trimmed = raw.replace(/#.*$/, '').trim()
    const hostMatch = /^Host\s+(.+)$/i.exec(trimmed)

    if (hostMatch) {
      const patterns = hostMatch[1]!.trim().split(/\s+/).filter(Boolean)
      if (isManagedHost(patterns)) {
        // skip this entire Host block (will re-append from hosts list)
        inHostBlock = true
        currentHostPatterns = patterns
        i++
        while (i < lines.length) {
          const t = lines[i]!.replace(/#.*$/, '').trim()
          if (/^Host\s+/i.test(t)) break
          i++
        }
        inHostBlock = false
        currentHostPatterns = []
        continue
      }
      // Host * or special — keep block as-is
      kept.push(raw)
      i++
      while (i < lines.length) {
        const t = lines[i]!.replace(/#.*$/, '').trim()
        if (/^Host\s+/i.test(t)) break
        kept.push(lines[i]!)
        i++
      }
      continue
    }

    if (!inHostBlock) {
      kept.push(raw)
    }
    i++
  }

  // Trim trailing empty lines from kept
  while (kept.length && kept[kept.length - 1]!.trim() === '') kept.pop()

  const hostBlocks = hosts.map((h) => serializeHostBlock(h)).join('\n\n')
  const head = kept.join('\n').trimEnd()
  if (!head && !hostBlocks) return ''
  if (!head) return hostBlocks + '\n'
  if (!hostBlocks) return head + '\n'
  return `${head}\n\n${hostBlocks}\n`
}

export function hostFromInput(input: SshHostInput): SshHostEntry {
  const alias = input.alias.trim()
  if (!alias || /\s/.test(alias)) {
    throw new Error('Host alias is required (single token, no spaces)')
  }
  return {
    alias,
    patterns: [alias],
    hostName: input.hostName?.trim() || undefined,
    user: input.user?.trim() || undefined,
    port: input.port && input.port > 0 ? input.port : 22,
    identityFile: input.identityFile?.trim() || undefined,
    options: {}
  }
}
