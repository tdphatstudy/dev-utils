import { expect, it } from 'vitest'
import { isQuickTarget, QUICK_TOOLS, quickTargetPath } from './quick-actions'

it('allows only fixed tool IDs and Home, never arbitrary routes or URLs', () => {
  expect(isQuickTarget('home')).toBe(true)
  expect(isQuickTarget('app.settings')).toBe(true)
  expect(quickTargetPath('app.settings')).toBe('/tool/app.settings')
  for (const item of QUICK_TOOLS) { expect(isQuickTarget(item.id)).toBe(true); expect(quickTargetPath(item.id)).toBe(`/tool/${item.id}`) }
  for (const target of ['https://example.com', '../../private', 'main', '/tool/privatebox.home', null, {}]) expect(isQuickTarget(target)).toBe(false)
})
