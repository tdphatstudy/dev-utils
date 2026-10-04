import { expect, it } from 'vitest'
import { formatJsonText } from './format-text'
it('changes only JSON layout, preserving duplicate keys, numbers and escapes', () => {
  const input = '{"large":9007199254740993,"large":1e999,"negative":-0,"text":"\\u0061","empty":[],"nested":[true,null]}'
  const formatted = formatJsonText(input)
  expect(formatted).toContain('9007199254740993')
  expect(formatted).toContain('1e999')
  expect(formatted).toContain('-0')
  expect(formatted).toContain('"\\u0061"')
  expect(formatted.match(/"large"/g)).toHaveLength(2)
  expect(formatJsonText(formatted)).toBe(formatted)
  expect(formatted).toContain('"empty": []')
  expect(formatJsonText('null')).toBe('null')
  expect(formatJsonText('{broken')).toBe('{broken')
})
