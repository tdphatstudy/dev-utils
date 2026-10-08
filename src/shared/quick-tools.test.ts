import { expect, it } from 'vitest'
import { DEFAULT_GLOBAL_BINDINGS, electronAccelerator, validateGlobalBindings } from './quick-tools'
it('normalizes platform accelerators and rejects reserved, bare and duplicate global combinations', () => {
  expect(electronAccelerator('Mod+Shift+Space', 'win32')).toBe('Control+Shift+Space')
  expect(electronAccelerator('Mod+Alt+ArrowUp', 'darwin')).toBe('Command+Alt+Up')
  expect(validateGlobalBindings(DEFAULT_GLOBAL_BINDINGS, 'linux')).toEqual(DEFAULT_GLOBAL_BINDINGS)
  for (const binding of ['V', 'Shift+V', 'Mod+V', 'Alt+F4', 'Meta+V']) expect(() => validateGlobalBindings({ ...DEFAULT_GLOBAL_BINDINGS, clipboard: binding }, 'win32')).toThrow()
  expect(() => validateGlobalBindings({ ...DEFAULT_GLOBAL_BINDINGS, color: 'Control+Shift+Space' }, 'win32')).toThrow('share')
})
