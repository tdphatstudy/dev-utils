import { expect, it } from 'vitest'
import { parsePasteTarget } from './clipboard-paste'
it('parses native window identity without accepting arbitrary command fragments or invalid PIDs', () => {
  expect(parsePasteTarget(' 123456\r\n', ' 789\r\n')).toEqual({ windowId: '123456', pid: 789 })
  for (const id of ['0', '-1', '1; whoami', '$(command)', '0x123', '9223372036854775808', '']) expect(() => parsePasteTarget(id, '789')).toThrow('unavailable')
  for (const pid of ['0', '-1', '1.5', 'NaN', 'Infinity', '9007199254740992']) expect(() => parsePasteTarget('123', pid)).toThrow('unavailable')
})
