import { describe, expect, it } from 'vitest'
import { formatHtml, minifyHtml, validateHtml } from './index'

const SAMPLE = `<!DOCTYPE html><html><head><title>Hi</title></head><body><h1>Hello</h1><p>World<br></p></body></html>`

describe('html', () => {
  it('validates simple html', () => {
    const r = validateHtml(SAMPLE)
    expect(r.ok).toBe(true)
  })

  it('formats with indent', () => {
    const r = formatHtml(SAMPLE, { indent: 2 })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.text).toMatch(/<!DOCTYPE html>/i)
      expect(r.text).toMatch(/\n {2}<head>/i)
    }
  })

  it('minifies', () => {
    const pretty = formatHtml(SAMPLE, { indent: 2 })
    expect(pretty.ok).toBe(true)
    if (!pretty.ok) return
    const mini = minifyHtml(pretty.text)
    expect(mini.ok).toBe(true)
    if (mini.ok) {
      expect(mini.text).toContain('<h1>')
      expect(mini.text.length).toBeLessThan(pretty.text.length)
    }
  })

  it('preserves script content', () => {
    const src = `<div><script>if (a < b) { x = 1 }</script></div>`
    const r = formatHtml(src, { indent: 2 })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.text).toContain('if (a < b)')
  })
})
