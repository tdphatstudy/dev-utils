import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { verifyDependencyPatches } from './dependency-patches.mjs'

export function checkDependencyAudit(value, verifiedPatches = []) {
  const record = item => item && typeof item === 'object' && !Array.isArray(item)
  const severities = ['info', 'low', 'moderate', 'high', 'critical']
  const counts = value?.metadata?.vulnerabilities
  if (!record(value) || value.error || !record(value.advisories) || !record(counts) || Object.keys(counts).length !== severities.length || severities.some(key => !Number.isSafeInteger(counts[key]) || counts[key] < 0)) throw new Error('Dependency audit failed or returned an incomplete report.')
  const advisories = Object.values(value.advisories)
  const observed = Object.fromEntries(severities.map(severity => [severity, 0]))
  for (const advisory of advisories) {
    if (!record(advisory) || typeof advisory.module_name !== 'string' || !advisory.module_name.trim() || !severities.includes(advisory.severity)) throw new Error('Dependency audit returned an invalid advisory.')
    observed[advisory.severity] += 1
  }
  if (severities.some(severity => counts[severity] !== observed[severity])) throw new Error('Dependency audit returned inconsistent vulnerability counts.')
  const failures = advisories.flatMap(advisory => {
    const patched = verifiedPatches.find(patch => patch.name === advisory.module_name && patch.advisory === advisory.github_advisory_id)
    if (patched && Array.isArray(advisory.findings) && advisory.findings.length && advisory.findings.every(finding => finding.version === patched.version && Array.isArray(finding.paths) && finding.paths.length)) return []
    return [`${advisory.severity}: ${advisory.module_name.slice(0, 100)} — ${String(advisory.github_advisory_id || advisory.id || 'unknown').slice(0, 100)}`]
  })
  return failures
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const chunks = []
    let size = 0
    for await (const chunk of process.stdin) {
      size += chunk.length
      if (size > 4 * 1024 * 1024) throw new Error('Dependency audit report exceeds its size limit.')
      chunks.push(chunk)
    }
    const verifiedPatches = verifyDependencyPatches(process.cwd())
    const failures = checkDependencyAudit(JSON.parse(Buffer.concat(chunks).toString('utf8')), verifiedPatches)
    if (failures.length) {
      console.error(failures.join('\n'))
      process.exitCode = 1
    } else console.log(`Dependency audit passed with ${verifiedPatches.length} verified local patches; no unmitigated runtime or build advisories.`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Dependency audit failed.')
    process.exitCode = 1
  }
}
