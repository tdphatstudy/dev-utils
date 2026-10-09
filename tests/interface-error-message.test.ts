import { describe, expect, it } from 'vitest'
import { interfaceErrorMessage } from '../src/shared/i18n/error-message'
import { translate } from '../src/shared/i18n/catalog'

describe('interface operation errors', () => {
  it('localizes an Electron error without displaying the IPC channel', () => {
    const error = new Error("Error invoking remote method 'clipboard:paste': Error: Direct paste is unavailable. Copy the entry and paste it in your target app.")
    expect(translate('vi', interfaceErrorMessage(error))).toBe('Không thể dán trực tiếp. Sao chép mục rồi dán trong ứng dụng cần dùng.')
  })
  it('preserves ordinary errors, including file validation detail', () => {
    expect(interfaceErrorMessage(new Error('Unsupported file: example.pdf'))).toBe('Unsupported file: example.pdf')
    expect(interfaceErrorMessage(new Error('Invalid regular expression: /[/'))).toBe('Invalid regular expression: /[/')
  })
  it('uses the fallback for empty or non-error rejection values', () => {
    expect(interfaceErrorMessage(new Error('   '))).toBe('The action failed. Try again.')
    expect(interfaceErrorMessage({ message: 'private data' })).toBe('The action failed. Try again.')
  })
})
