import { expect, it } from 'vitest'
import { isVaultAccessError } from './access-errors'
it('recognizes Electron-prefixed access/session errors without misclassifying ordinary IO errors', () => {
  for (const message of ['NEEDS_ACCESS', "Error invoking remote method 'privateBox:readFile': Error: SESSION_CHANGED: Box changed", "Error invoking remote method 'privateBox:list': Error: NEEDS_ACCESS"]) expect(isVaultAccessError(new Error(message))).toBe(true)
  expect(isVaultAccessError(new Error('EACCES: permission denied'))).toBe(false)
  expect(isVaultAccessError('NEEDS_ACCESS')).toBe(false)
})
