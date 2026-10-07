import { expect, it } from 'vitest'
import { compareEnvironments, formatEnvironmentReport, MAX_ENV_LENGTH, MAX_ENV_LINES } from './compare'

it('compares presence and exact literal values without returning credentials', () => {
  const result = compareEnvironments('API_TOKEN=baseline-secret\nEMPTY=\nONLY_BASE=1\nUNCHANGED=yes', 'API_TOKEN=target-secret\nEMPTY=\nONLY_TARGET=1\nUNCHANGED=yes')
  expect(result.counts).toEqual({ same: 2, changed: 1, missing: 1, extra: 1 })
  expect(result.rows).toContainEqual({ key: 'ONLY_BASE', status: 'missing' })
  expect(result.rows).toContainEqual({ key: 'ONLY_TARGET', status: 'extra' })
  for (const output of [JSON.stringify(result), formatEnvironmentReport(result)]) {
    expect(output).not.toContain('baseline-secret')
    expect(output).not.toContain('target-secret')
  }
})

it('handles BOM, CRLF, export, comments, quoted hashes and multiline values literally', () => {
  const baseline = '\uFEFF# comment\r\nexport TOKEN="a#b" # note\r\nMULTI=\'first\r\nsecond\'\r\nLITERAL=${TOKEN}\r\nEMPTY= # empty'
  const target = 'TOKEN=\'a#b\'\nMULTI="first\nsecond"\nLITERAL=${TOKEN}\nEMPTY='
  expect(compareEnvironments(baseline, target).counts).toEqual({ same: 4, changed: 0, missing: 0, extra: 0 })
})

it('keeps escaped quotes and backslashes literal and reports duplicate assignments', () => {
  const result = compareEnvironments('KEY=first\nKEY="last\\"quote"\n__proto__=x', 'KEY=\'last\\"quote\'\n__proto__=y')
  expect(result.duplicateKeys.baseline).toEqual(['KEY'])
  expect(result.rows).toContainEqual({ key: 'KEY', status: 'same' })
  expect(result.rows).toContainEqual({ key: '__proto__', status: 'changed' })
})

it.each(['source secrets', 'KEY="credential', 'KEY="credential" execute', 'KEY=secret\0'])('refuses unsupported syntax without echoing its content', (input) => {
  expect(() => compareEnvironments(input, '')).toThrow()
  try { compareEnvironments(input, '') } catch (error) { expect((error as Error).message).not.toMatch(/secrets|credential|execute|KEY=secret/) }
})

it('bounds input work and supports empty environments', () => {
  expect(compareEnvironments('', '').rows).toEqual([])
  expect(() => compareEnvironments('A'.repeat(MAX_ENV_LENGTH + 1), '')).toThrow('256 Ki')
  expect(() => compareEnvironments('\n'.repeat(MAX_ENV_LINES), '')).toThrow('5,000')
})
