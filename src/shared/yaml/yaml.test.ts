import { describe, expect, it } from 'vitest'
import { formatYaml, jsonToYaml, parseYaml, yamlToJson } from './index'

describe('YAML developer workflows', () => {
  it('preserves comments and aliases while formatting', () => {
    const input = '# deployment settings\ndefaults: &defaults\n  retries: 3 # keep this\nproduction: *defaults\n'
    const result = formatYaml(input)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.text).toContain('# deployment settings')
      expect(result.text).toContain('# keep this')
      expect(result.text).toContain('&defaults')
      expect(result.text).toContain('*defaults')
      expect(parseYaml(result.text!).ok).toBe(true)
    }
  })
  it('gives a position for duplicate mapping keys', () => {
    const result = parseYaml('name: one\nname: two\n')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.line).toBe(2)
      expect(result.column).toBe(1)
      expect(result.offset).toBe(10)
    }
  })
  it('does not silently turn non-finite YAML numbers into null', () => {
    expect(yamlToJson('value: .nan').ok).toBe(false)
    expect(yamlToJson('value: .inf').ok).toBe(false)
  })
  it('reports circular aliases instead of crashing conversion', () => {
    expect(yamlToJson('node: &node\n  child: *node\n').ok).toBe(false)
  })
  it('uses actionable JSON diagnostics in JSON to YAML conversion', () => {
    const result = jsonToYaml('{\n  unquoted: 1\n}')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.line).toBe(2)
  })
})
