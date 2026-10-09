import { expect, it } from 'vitest'
import { checkDependencyAudit } from '../scripts/dependency-audit.mjs'

it('passes only a complete, successful audit with no advisories', () => {
  expect(checkDependencyAudit({ advisories: {}, metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 } } })).toEqual([])
  for (const invalid of [null, {}, { error: { code: 'ENETWORK' } }, { advisories: {}, metadata: {} }, { advisories: {}, metadata: { vulnerabilities: { critical: 0 } } }, { advisories: {}, metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, unknown: 0 } } }]) expect(() => checkDependencyAudit(invalid)).toThrow(/audit/i)
})

it('fails for build dependencies too and rejects mismatched severity counters', () => {
  const audit = { advisories: { '1': { module_name: 'app-builder-lib', severity: 'high', github_advisory_id: 'GHSA-test', title: 'Search path issue', findings: [{ paths: ['.>electron-builder>app-builder-lib'] }] } }, metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0 } } }
  expect(checkDependencyAudit(audit)).toEqual(['high: app-builder-lib — GHSA-test'])
  expect(() => checkDependencyAudit({ ...audit, metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 } } })).toThrow(/inconsistent/i)
  expect(() => checkDependencyAudit({ ...audit, advisories: {}, metadata: { vulnerabilities: { info: 0, low: 0, moderate: 1, high: 0, critical: 0 } } })).toThrow(/inconsistent/i)
})

it('counts each advisory before patch exclusions without counting dependency paths', () => {
  const verified = [
    { name: 'braces', version: '3.0.3', advisory: 'GHSA-vfj7-8cjw-p6xm' },
    { name: 'sprintf-js', version: '1.1.3', advisory: 'GHSA-hp3w-g68c-fv3c' }
  ]
  const audit = {
    advisories: {
      '1240992': { module_name: 'braces', severity: 'high', github_advisory_id: verified[0].advisory, findings: [{ version: '3.0.3', paths: ['.>tailwindcss>chokidar>braces', '.>other>braces'] }, { version: '3.0.3', paths: ['.>third>braces'] }] },
      '1241202': { module_name: 'sprintf-js', severity: 'moderate', github_advisory_id: verified[1].advisory, findings: [{ version: '1.1.3', paths: ['.>electron-builder>app-builder-lib>@electron/get>global-agent>roarr>sprintf-js'] }] }
    },
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 1, high: 1, critical: 0 } }
  }
  expect(checkDependencyAudit(audit, verified)).toEqual([])
  for (const counts of [
    { info: 0, low: 0, moderate: 1, high: 1, critical: 1 },
    { info: 0, low: 0, moderate: 1, high: 0, critical: 0 },
    { info: 0, low: 0, moderate: 2, high: 0, critical: 0 }
  ]) expect(() => checkDependencyAudit({ ...audit, metadata: { vulnerabilities: counts } }, verified)).toThrow(/inconsistent/i)
  expect(() => checkDependencyAudit({ ...audit, advisories: { ...audit.advisories, extra: audit.advisories['1240992'] } }, verified)).toThrow(/inconsistent/i)
})

it('rejects unknown severities and malformed advisories before patch exclusions', () => {
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 }
  for (const advisory of [null, {}, { module_name: '', severity: 'high' }, { module_name: 'braces', severity: 'unknown' }, { module_name: 'braces', severity: '' }, { module_name: 'braces', severity: 1 }]) expect(() => checkDependencyAudit({ advisories: { '1': advisory }, metadata: { vulnerabilities: counts } })).toThrow(/invalid advisory/i)
})
