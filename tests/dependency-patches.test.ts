import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { verifyDependencyPatches } from '../scripts/dependency-patches.mjs'
import { checkDependencyAudit } from '../scripts/dependency-audit.mjs'

const require = createRequire(import.meta.url)
const braces = require('braces')
const { sprintf } = require('sprintf-js')

it('bounds recursive brace parsing and AST walkers while preserving normal glob output', () => {
  expect(braces.expand('src/{main,shared}/{a,b}.ts')).toEqual(['src/main/a.ts', 'src/main/b.ts', 'src/shared/a.ts', 'src/shared/b.ts'])
  for (const method of [braces, braces.parse, braces.compile, braces.expand, braces.stringify]) {
    for (const [open, close] of [['{', '}'], ['(', ')']]) expect(() => method(open.repeat(3000) + 'a,b' + close.repeat(3000))).toThrow('structural limits')
  }
  let ast: object = { type: 'text', value: 'x' }
  for (let depth = 0; depth < 1000; depth++) ast = { type: 'root', nodes: [ast] }
  for (const method of [braces.compile, braces.expand, braces.stringify]) expect(() => method(ast)).toThrow('structural limits')
  const cyclic: { type: string; nodes: unknown[] } = { type: 'root', nodes: [] }
  cyclic.nodes.push(cyclic)
  expect(() => braces.stringify(cyclic)).toThrow('structural limits')
})

it('rejects abusive precision and width before formatting and retains ordinary output', () => {
  expect(sprintf('%s %.2f %04d', 'value', 1.25, 7)).toBe('value 1.25 0007')
  for (const format of ['%.9999999999999999999f', '%9999999999999999999s', '%(value).9999999999999999999s']) expect(() => sprintf(format, { value: 'x' })).toThrow('structural limits')
})

it('requires the exact installed patches and fails closed for new advisories or changed versions', () => {
  const verified = verifyDependencyPatches(resolve('.'), new Date('2026-10-09T00:00:00Z'))
  const audit = { advisories: { '1': { module_name: 'braces', severity: 'high', github_advisory_id: 'GHSA-vfj7-8cjw-p6xm', findings: [{ version: '3.0.3', paths: ['.>tailwindcss>braces'] }] } }, metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0 } } }
  expect(checkDependencyAudit(audit, verified)).toEqual([])
  audit.advisories['1'].github_advisory_id = 'GHSA-new'
  expect(checkDependencyAudit(audit, verified)).toHaveLength(1)
  audit.advisories['1'].github_advisory_id = 'GHSA-vfj7-8cjw-p6xm'
  audit.advisories['1'].findings[0].version = '3.0.2'
  expect(checkDependencyAudit(audit, verified)).toHaveLength(1)
  expect(() => verifyDependencyPatches(resolve('.'), new Date('2026-11-09T00:00:00Z'))).toThrow('review')
})
