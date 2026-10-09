import { describe, expect, it } from 'vitest'
import { collectSourceMessages, isTechnicalCopy } from '../scripts/i18n-coverage.mjs'
import { filterSlash } from '../src/renderer/src/features/privatebox/editors/notionBlocks'
import { translate } from '../src/shared/i18n/catalog'

describe('interface source coverage', () => {
  it('requires translations for native and component copy props and preserves technical samples', () => {
    const messages = collectSourceMessages(`<Panel title="Review changes" summary="Your changes are ready"><button aria-label="Run analysis">Run now</button><Editor language="json" value="Settings" /><pre>{'fetch("http://localhost")'}</pre></Panel>`)
    expect(messages.map(item => item.message)).toEqual(['Review changes', 'Your changes are ready', 'Run analysis', 'Run now'])
    expect(messages.every(item => !item.localized)).toBe(true)
    expect(isTechnicalCopy('-----BEGIN PUBLIC KEY----- … -----END PUBLIC KEY-----')).toBe(true)
  })
  it('recognizes translated templates and deferred metadata keys without hiding missing catalog messages', () => {
    const messages = collectSourceMessages(`const items = [{ label: messageKey('Field name') }]; function View() { return <p>{uiText('Ready {count}', {count: 1})}</p> }`)
    expect(messages.map(item => [item.message, item.localized])).toEqual([['Field name', true], ['Ready {count}', true]])
  })
})

describe('localized Markdown command search', () => {
  it('matches localized and accent-free labels while keeping English aliases available', () => {
    const localize = (source: string): string => translate('vi', source)
    expect(filterSlash('tieu de', localize).map(item => item.id)).toContain('h1')
    expect(filterSlash('heading', localize).map(item => item.id)).toContain('h1')
    expect(filterSlash('checkbox', localize).map(item => item.id)).toContain('todo')
    expect(filterSlash('not a command', localize)).toEqual([])
  })
})
