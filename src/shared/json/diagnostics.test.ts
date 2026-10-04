import { describe, expect, it } from 'vitest'
import { parseJson } from './index'

describe('JSON error locations and recovery hints', () => {
  it.each([
    ['{\n  "name" "DevUtils"\n}', 2, 10, 'colon'],
    ['{\r\n  name: 1\r\n}', 2, 3, 'property'],
    ['{\n  "n": 1\n  "b": 2\n}', 3, 3, 'comma'],
    ['[1,]', 1, 3, 'Trailing comma'],
    ['{"name": "unfinished', 1, 21, 'Unclosed string'],
    ['{"n":', 1, 6, 'value'],
    ['{"n": 01}', 1, 8, 'Leading zero'],
    ['{"n": 1e}', 1, 9, 'exponent'],
    ['{"a":"\\x"}', 1, 8, 'escape'],
    ['{"a":"\\u12X4"}', 1, 11, 'Unicode'],
    ['true false', 1, 6, 'after'],
    ['{\n "emoji": "😀",\n "broken":\n}', 4, 1, 'token']
  ])('locates %s', (input, line, column, message) => {
    const result = parseJson(input)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.line).toBe(line)
      expect(result.column).toBe(column)
      expect(result.error).toContain(message)
      expect(result.hint).toBeTruthy()
      expect(result.offset).toBeGreaterThanOrEqual(0)
      expect(result.offset).toBeLessThanOrEqual(input.length)
    }
  })

  it.each(['null', 'false', '0', '""', '[]', '{}', '{"__proto__":{"a":1}}', '[1.2e-3,"\\u1234"]'])('preserves valid JSON %s', (input) => {
    expect(parseJson(input)).toEqual({ ok: true, value: JSON.parse(input) })
  })
})
