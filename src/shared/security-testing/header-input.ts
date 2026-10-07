/** Parse copied HTTP response headers without persisting or returning their values in reports. */
export function parseResponseHeaders(text: string): Record<string, string> {
  if (typeof text !== 'string' || !text.trim() || text.length > 65536) throw new Error('Paste response headers up to 64 Ki characters.')
  const headers: Record<string, string> = Object.create(null)
  let count = 0, statusSeen = false
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    if (/^HTTP\/\S+\s+\d{3}(?:\s|$)/.test(line)) {
      if (statusSeen || count) throw new Error('Paste headers from a single response, not a redirect chain.')
      statusSeen = true; continue
    }
    const match = /^([!#$%&'*+.^_`|~0-9a-z-]+):[\t ]*([^\r\n\0]*)$/i.exec(line)
    if (!match || line.length > 8192 || ++count > 256) throw new Error('Use Name: value response headers, without folded lines or response bodies.')
    const name = match[1].toLowerCase()
    headers[name] = Object.hasOwn(headers, name) ? headers[name] + ', ' + match[2] : match[2]
  }
  if (!count) throw new Error('Paste at least one Name: value response header.')
  return headers
}
