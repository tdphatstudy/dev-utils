/** Collapse layout whitespace only, preserving quoted values and comment boundaries. */
export function compactSql(input: string): string {
  let out = ''
  let i = 0
  let space = false
  const append = (text: string): void => {
    if (space && out && !out.endsWith('\n')) out += ' '
    space = false
    out += text
  }
  while (i < input.length) {
    if (/\s/.test(input[i]!)) { space = true; i++; continue }
    const start = i
    if (input.startsWith('--', i) || input[i] === '#') {
      const end = input.indexOf('\n', i)
      if (end < 0) { append(input.slice(i)); break }
      append(input.slice(i, end + 1))
      i = end + 1
      continue
    }
    if (input.startsWith('/*', i)) {
      i += 2
      let depth = 1
      while (i < input.length && depth > 0) {
        if (input.startsWith('/*', i)) { depth++; i += 2 }
        else if (input.startsWith('*/', i)) { depth--; i += 2 }
        else i++
      }
      append(input.slice(start, i))
      continue
    }
    const dollar = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(input.slice(i))?.[0]
    if (dollar) {
      const end = input.indexOf(dollar, i + dollar.length)
      i = end < 0 ? input.length : end + dollar.length
      append(input.slice(start, i))
      continue
    }
    const quote = input[i]!
    if ('\'"`['.includes(quote)) {
      const close = quote === '[' ? ']' : quote
      i++
      while (i < input.length) {
        if (input[i] === '\\') { i = Math.min(input.length, i + 2); continue }
        if (input[i] === close) {
          i++
          if (input[i] === close) { i++; continue }
          break
        }
        i++
      }
      append(input.slice(start, i))
      continue
    }
    append(input[i++]!)
  }
  return out.trimEnd()
}
