export interface JsonDiagnostic {
  error: string
  hint: string
  offset: number
  line: number
  column: number
}

/** Locate the first syntax error without relying on engine-specific error text.
 * JSON.parse remains authoritative; this scanner only runs after it fails.
 */
export function diagnoseJson(input: string, fallback: string): JsonDiagnostic {
  let i = 0
  const fail = (error: string, hint: string, offset = i): never => {
    throw { error, hint, offset }
  }
  const whitespace = (): void => {
    while (i < input.length && /[\t\n\r ]/.test(input[i]!)) i++
  }
  const string = (): void => {
    i++
    while (i < input.length) {
      const char = input[i++]!
      if (char === '"') return
      if (char.charCodeAt(0) < 32) {
        fail('Unescaped control character in string', 'Use \\n, \\t or another JSON escape inside strings.', i - 1)
      }
      if (char === '\\') {
        const escape = input[i++]
        if (escape === 'u') {
          for (let n = 0; n < 4; n++, i++) {
            if (!/[0-9a-f]/i.test(input[i] ?? '!')) {
              fail('Invalid Unicode escape', 'Use \\u followed by exactly four hexadecimal digits.')
            }
          }
        } else if (!escape || !'"\\/bfnrt'.includes(escape)) {
          fail('Invalid string escape', 'JSON supports \\", \\\\, \\/, \\b, \\f, \\n, \\r, \\t and \\uXXXX.', Math.min(i - 1, input.length))
        }
      }
    }
    fail('Unclosed string', 'Add a closing double quote.', input.length)
  }
  const value = (depth = 0): void => {
    whitespace()
    if (depth > 512) throw new RangeError('Diagnostic depth limit')
    const char = input[i]
    if (char === '"') return string()
    if (char === '{' || char === '[') {
      const object = char === '{'
      const close = object ? '}' : ']'
      i++
      whitespace()
      if (input[i] === close) { i++; return }
      while (true) {
        if (object) {
          if (input[i] !== '"') fail('Expected a double-quoted property name', 'Wrap object keys in double quotes; JSON does not allow comments or single quotes.')
          string()
          whitespace()
          if (input[i] !== ':') fail('Expected a colon after the property name', 'Separate the key and its value with : .')
          i++
        }
        value(depth + 1)
        whitespace()
        if (input[i] === close) { i++; return }
        if (i === input.length) fail(`Expected closing ${close}`, `Close this ${object ? 'object' : 'array'} with ${close}.`)
        if (input[i] !== ',') fail(`Expected a comma or ${close}`, 'Separate adjacent properties or array items with a comma.')
        i++
        whitespace()
        if (input[i] === close) fail('Trailing comma is not allowed', 'Remove the comma before the closing bracket.', i - 1)
      }
    }
    if (char === '-' || /[0-9]/.test(char ?? '!')) {
      if (char === '-') i++
      if (input[i] === '0') {
        i++
        if (/[0-9]/.test(input[i] ?? '!')) fail('Leading zero in number', 'Remove the leading zero, or use a quoted string for an identifier.')
      } else {
        if (!/[1-9]/.test(input[i] ?? '!')) fail('Expected a digit', 'A minus sign must be followed by a number.')
        while (/[0-9]/.test(input[i] ?? '!')) i++
      }
      if (input[i] === '.') {
        i++
        if (!/[0-9]/.test(input[i] ?? '!')) fail('Expected a digit after the decimal point', 'Add fractional digits or remove the decimal point.')
        while (/[0-9]/.test(input[i] ?? '!')) i++
      }
      if (/[eE]/.test(input[i] ?? '!')) {
        i++
        if (/[+-]/.test(input[i] ?? '!')) i++
        if (!/[0-9]/.test(input[i] ?? '!')) fail('Expected an exponent digit', 'Complete the exponent, for example 1e3.')
        while (/[0-9]/.test(input[i] ?? '!')) i++
      }
      return
    }
    for (const literal of ['true', 'false', 'null']) {
      if (input.startsWith(literal, i)) { i += literal.length; return }
    }
    fail(i === input.length ? 'Expected a JSON value' : 'Unexpected token', 'Use an object, array, double-quoted string, number, true, false or null.')
  }

  let issue: { error: string; hint: string; offset: number }
  try {
    value()
    whitespace()
    if (i !== input.length) fail('Unexpected content after the JSON value', 'Keep one root JSON value; remove extra characters or wrap multiple values in an array.')
    issue = { error: fallback, hint: 'Check the JSON syntax at this location.', offset: i }
  } catch (e) {
    if (e && typeof e === 'object' && 'offset' in e && 'hint' in e) {
      issue = e as typeof issue
    } else {
      const match = /position\s+(\d+)/i.exec(fallback)
      issue = { error: fallback, hint: 'Check the JSON syntax.', offset: match ? Number(match[1]) : i }
    }
  }
  const offset = Math.max(0, Math.min(input.length, issue.offset))
  const before = input.slice(0, offset).split(/\r\n|\r|\n/)
  return { ...issue, offset, line: before.length, column: before[before.length - 1]!.length + 1 }
}
