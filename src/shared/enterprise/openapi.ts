import { atPointer, canonical, isRecord, own, parseContract, type RecordValue } from './common'

export interface ContractFinding { severity: 'breaking' | 'review' | 'info'; operation: string; rule: string; detail: string }
export interface ContractOperation { operation: string; operationId: string; secured: boolean; responses: number }
export interface ContractResult { version: string; targetVersion?: string; operations: ContractOperation[]; findings: ContractFinding[]; counts: Record<ContractFinding['severity'], number>; truncated: boolean; compared: boolean }
const methods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']
const metadata = new Set(['summary', 'description', 'example', 'examples', 'externalDocs', 'default', 'enum', 'const'])
const dictionaries = new Set(['properties', 'patternProperties', '$defs', 'definitions', 'schemas', 'paths', 'responses', 'headers', 'content', 'securitySchemes', 'links', 'callbacks', 'webhooks'])
type Operation = { key: string; item: RecordValue; parameters: Map<string, RecordValue>; security: unknown }

function readContract(text: string, side: string, emit: (finding: ContractFinding) => void): { version: string; ops: Map<string, Operation> } {
  const root = parseContract(text), version = own(root, 'openapi')
  if (typeof version !== 'string' || !/^3\.(0|1)\.\d+$/.test(version)) throw new Error(`${side}: supported OpenAPI versions are 3.0.x and 3.1.x.`)
  const info = own(root, 'info'), paths = own(root, 'paths')
  if (!isRecord(info) || typeof own(info, 'title') !== 'string' || typeof own(info, 'version') !== 'string' || !isRecord(paths)) throw new Error(`${side}: provide info.title, info.version and a paths object.`)
  let work = 0
  const expand = (value: unknown, active = new Set<string>(), depth = 0, dictionary = false): unknown => {
    if (++work > 100000 || depth > 64) throw new Error(`${side}: reference expansion exceeds the analysis budget.`)
    if (Array.isArray(value)) return value.map(item => expand(item, active, depth + 1))
    if (!isRecord(value)) return value
    const ref = dictionary ? undefined : own(value, '$ref')
    if (ref !== undefined) {
      if (typeof ref !== 'string' || !ref.startsWith('#/') || ref.includes('%')) throw new Error(`${side}: only local JSON Pointer $refs are supported; URLs/files are never fetched.`)
      if (active.has(ref)) throw new Error(`${side}: recursive $refs need manual review. Flatten this contract for bounded comparison.`)
      const target = atPointer(root, ref.slice(1))
      if (target === undefined) throw new Error(`${side}: unresolved local $ref.`)
      if (Object.keys(value).some(key => key !== '$ref' && !['summary', 'description'].includes(key))) throw new Error(`${side}: $ref siblings with validation constraints require manual review.`)
      return expand(target, new Set([...active, ref]), depth + 1)
    }
    const result: RecordValue = Object.create(null)
    for (const [key, child] of Object.entries(value)) {
      if (!dictionary && metadata.has(key)) continue
      result[key] = !dictionary && key === 'security' ? child : expand(child, active, depth + 1, !dictionary && dictionaries.has(key))
    }
    // Enum/const are constraints. Keep their literal values for comparison, never for reports.
    if (!dictionary) for (const key of ['enum', 'const']) if (Object.hasOwn(value, key)) result[key] = value[key]
    return result
  }
  const ops = new Map<string, Operation>(), ids = new Set<string>()
  for (const [path, rawPath] of Object.entries(paths)) {
    if (path.startsWith('x-')) continue
    if (!path.startsWith('/')) throw new Error(`${side}: path names must begin with /.`)
    const item = expand(rawPath)
    if (!isRecord(item)) throw new Error(`${side}: each path item must be an object.`)
    for (const method of methods) {
      const operation = own(item, method)
      if (operation === undefined) continue
      const key = method.toUpperCase() + ' ' + path
      if (!isRecord(operation) || !isRecord(own(operation, 'responses')) || !Object.keys(operation.responses as RecordValue).length) throw new Error(`${side}: ${key} needs a responses object.`)
      const parameters = new Map<string, RecordValue>()
      for (const list of [own(item, 'parameters'), own(operation, 'parameters')]) {
        if (list === undefined) continue
        if (!Array.isArray(list)) throw new Error(`${side}: ${key} parameters must be an array.`)
        const local = new Set<string>()
        for (const param of list) {
          if (!isRecord(param) || typeof param.name !== 'string' || !['query', 'header', 'path', 'cookie'].includes(param.in as string)) throw new Error(`${side}: ${key} has an invalid parameter.`)
          const identity = param.in + ':' + (param.in === 'header' ? param.name.toLowerCase() : param.name)
          if (local.has(identity)) throw new Error(`${side}: ${key} has duplicate parameters.`)
          local.add(identity); parameters.set(identity, param)
          if (param.in === 'path' && param.required !== true) emit({ severity: 'review', operation: `${side}: ${key}`, rule: 'path-required', detail: 'A path parameter must declare required: true.' })
        }
      }
      const security = Object.hasOwn(operation, 'security') ? operation.security : own(root, 'security')
      if (security !== undefined && (!Array.isArray(security) || security.some(requirement => !isRecord(requirement) || Object.values(requirement).some(scopes => !Array.isArray(scopes) || scopes.some(scope => typeof scope !== 'string'))))) throw new Error(`${side}: ${key} has invalid security requirements.`)
      if (!Array.isArray(security) || !security.length || security.some(requirement => isRecord(requirement) && !Object.keys(requirement).length)) emit({ severity: 'review', operation: `${side}: ${key}`, rule: 'anonymous-access', detail: 'Authentication is not required by this contract. Confirm that public access is intentional.' })
      const id = own(operation, 'operationId')
      if (typeof id !== 'string' || !id.trim()) emit({ severity: 'review', operation: `${side}: ${key}`, rule: 'operation-id', detail: 'No operationId is declared; generated clients need a stable identifier.' })
      else { if (ids.has(id)) emit({ severity: 'review', operation: `${side}: ${key}`, rule: 'duplicate-id', detail: 'An operationId is reused.' }); ids.add(id) }
      for (const code of Object.keys(operation.responses as RecordValue)) {
        if (code !== 'default' && !/^[1-5](?:\d{2}|XX)$/.test(code)) emit({ severity: 'review', operation: `${side}: ${key}`, rule: 'response-code', detail: 'A response key is outside the supported HTTP status/range syntax.' })
      }
      ops.set(key, { key, item: operation, parameters, security })
      if (ops.size > 3000) throw new Error('At most 3,000 operations per contract are supported.')
    }
  }
  if (own(root, 'webhooks') || own(root, 'callbacks')) emit({ severity: 'review', operation: side, rule: 'coverage', detail: 'Webhooks and root callbacks are outside path-operation comparison.' })
  for (const op of ops.values()) if (own(op.item, 'callbacks')) emit({ severity: 'review', operation: `${side}: ${op.key}`, rule: 'coverage', detail: 'Callback contracts require a separate review.' })
  return { version, ops }
}

export function reviewContract(baselineText: string, targetText = ''): ContractResult {
  const findings: ContractFinding[] = [], counts = { breaking: 0, review: 0, info: 0 }
  let total = 0
  const emit = (finding: ContractFinding): void => { counts[finding.severity]++; total++; if (findings.length < 1000) findings.push(finding) }
  const baseline = readContract(baselineText, 'Baseline', emit), target = targetText.trim() ? readContract(targetText, 'Target', emit) : undefined
  if (target) {
    if (baseline.version !== target.version) emit({ severity: 'review', operation: 'Contract', rule: 'dialect-change', detail: 'OpenAPI version changed. Review schema dialect compatibility.' })
    for (const [key, before] of baseline.ops) {
      const after = target.ops.get(key)
      const change = (severity: ContractFinding['severity'], rule: string, detail: string): void => emit({ severity, operation: key, rule, detail })
      if (!after) { change('breaking', 'operation-removed', 'An existing operation was removed.'); continue }
      for (const [name, param] of after.parameters) {
        const previous = before.parameters.get(name)
        if (param.required === true && previous?.required !== true) change('breaking', 'parameter-required', `A parameter is now required (${name}).`)
        if (previous && canonical(previous) !== canonical(param)) change('review', 'parameter-contract', `A parameter contract changed (${name}); check types, enums and serialization.`)
      }
      for (const name of before.parameters.keys()) if (!after.parameters.has(name)) change('review', 'parameter-removed', `A parameter was removed (${name}); review existing callers.`)
      const oldBody = own(before.item, 'requestBody'), newBody = own(after.item, 'requestBody')
      if (isRecord(newBody) && newBody.required === true && (!isRecord(oldBody) || oldBody.required !== true)) change('breaking', 'body-required', 'A request body is now required.')
      if (canonical(oldBody) !== canonical(newBody)) change('review', 'request-contract', 'Request body/schema/media types changed; validate existing requests against the target schema.')
      for (const code of Object.keys(before.item.responses as RecordValue)) if (!Object.hasOwn(after.item.responses as RecordValue, code)) change('breaking', 'response-removed', `An existing response was removed (${code}).`)
      if (canonical(before.item.responses) !== canonical(after.item.responses)) change('review', 'response-contract', 'Response schemas/media types/headers changed; review generated clients and consumers.')
      if (canonical(before.security) !== canonical(after.security)) change('review', 'security-change', 'Authentication requirements or scopes changed. Review access and client compatibility.')
      if (own(before.item, 'operationId') !== own(after.item, 'operationId')) change('review', 'client-name', 'operationId changed; generated client method names may change.')
    }
    for (const key of target.ops.keys()) if (!baseline.ops.has(key)) emit({ severity: 'info', operation: key, rule: 'operation-added', detail: 'A new operation was added.' })
  }
  const current = target ?? baseline
  return {
    version: baseline.version, targetVersion: target?.version, findings, counts, compared: !!target, truncated: total > findings.length,
    operations: [...current.ops.values()].map(op => ({ operation: op.key, operationId: typeof op.item.operationId === 'string' ? op.item.operationId : '', secured: Array.isArray(op.security) && op.security.length > 0 && op.security.every(requirement => isRecord(requirement) && Object.keys(requirement).length > 0), responses: Object.keys(op.item.responses as RecordValue).length }))
  }
}
