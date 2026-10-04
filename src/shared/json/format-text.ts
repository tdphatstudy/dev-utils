import { parseJson } from './index'

/** Layout only: preserve numeric lexemes, duplicate keys and all string escapes. */
export function formatJsonText(input: string): string {
  if (!parseJson(input).ok) return input
  const tokens = input.match(/"(?:\\[\s\S]|[^"\\])*"|[^\s"{}\[\],:]+|[{}\[\],:]/g) ?? []
  let depth = 0
  let output = ''
  const pad = (): string => '  '.repeat(Math.min(depth, 256))
  tokens.forEach((token, i) => {
    if (token === '{' || token === '[') {
      output += token
      depth++
      if (tokens[i + 1] !== (token === '{' ? '}' : ']')) output += '\n' + pad()
    } else if (token === '}' || token === ']') {
      depth--
      if (tokens[i - 1] !== (token === '}' ? '{' : '[')) output += '\n' + pad()
      output += token
    } else if (token === ',') output += ',\n' + pad()
    else if (token === ':') output += ': '
    else output += token
  })
  return output
}
