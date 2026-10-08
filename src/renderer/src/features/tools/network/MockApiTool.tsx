import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Check, Download, Play, Plus, Square, Trash2, Undo2, Upload } from 'lucide-react'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { Modal } from '@renderer/components/ui/Modal'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import { useShortcut } from '@renderer/shortcuts/useShortcuts'
import { formatShortcut } from '@shared/shortcuts'
import {
  MOCK_CONDITION_OPERATORS, MOCK_CONDITION_SOURCES, MOCK_EXAMPLE_YAML, MOCK_LIMITS, MOCK_METHODS,
  matchMockRequest, parseMockConfig, parseMockTarget, serializeMockConfig, validateMockConfig, validateMockJson,
  type JsonValue, type MockCondition, type MockConfig, type MockEndpoint, type MockResponse, type MockStatus
} from '@shared/mock-api'

const stopped: MockStatus = { running: false, port: null, baseUrl: null, name: null, startedAt: null, requests: 0, logs: [] }
const newId = (): string => crypto.randomUUID()
const message = (error: unknown): string => error instanceof Error ? error.message : 'Operation failed. Please retry.'
const tabs = ['Endpoints', 'YAML', 'Try rules', 'Activity', 'Guide'] as const
type Tab = typeof tabs[number]
const operatorLabels: Record<MockCondition['operator'], string> = {
  exists: 'is present', missing: 'is missing', equals: 'equals', notEquals: 'does not equal',
  contains: 'contains', gt: 'is greater than', gte: 'is at least', lt: 'is less than', lte: 'is at most'
}

function download(text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/yaml' }))
  const link = document.createElement('a'); link.href = url; link.download = 'mock-api.yaml'; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function conditionLabel(condition: MockCondition): string {
  const value = condition.value === undefined ? '' : ` ${JSON.stringify(condition.value)}`
  return `${condition.source} ${condition.key || '(root)'} ${operatorLabels[condition.operator]}${value}`
}

export default function MockApiTool(): JSX.Element {
  const runShortcut = useShortcut('editor.run')
  useUiLocale()
  const [yaml, setYaml] = useState(MOCK_EXAMPLE_YAML)
  const [tab, setTab] = useState<Tab>('Endpoints')
  const [selected, setSelected] = useState('')
  const [status, setStatus] = useState<MockStatus>(stopped)
  const [appliedYaml, setAppliedYaml] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [initialAttempt, setInitialAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [undo, setUndo] = useState<{ yaml: string; selected: string; message: string } | null>(null)
  const [endpointDraft, setEndpointDraft] = useState<MockEndpoint | null>(null)
  const [responseDraft, setResponseDraft] = useState<{ endpoint: MockEndpoint; response: MockResponse } | null>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const alive = useRef(true)
  const importVersion = useRef(0)
  const statusGeneration = useRef(0)
  const polling = useRef(false)
  const operationPending = useRef(false)
  const api = window.devutils?.mockApi
  const parsed = useMemo(() => {
    try { return { config: parseMockConfig(yaml), error: '' } }
    catch (failure) { return { config: null, error: message(failure) } }
  }, [yaml])
  const config = parsed.config
  const canonicalDraft = useMemo(() => config ? serializeMockConfig(config) : null, [config])
  const hasPendingChanges = status.running && canonicalDraft !== appliedYaml
  const portChanged = status.running && !!config && config.port !== status.port
  const endpoint = config?.endpoints.find((entry) => entry.id === selected) ?? config?.endpoints[0]

  useEffect(() => {
    alive.current = true
    const generation = ++statusGeneration.current
    setReady(false)
    if (!api) { setReady(true); return () => { alive.current = false; importVersion.current++ } }
    void api.status().then(async (value) => {
      const active = value.running ? await api.getConfig() : null
      if (!alive.current || generation !== statusGeneration.current) return
      setStatus(value)
      if (active) { setYaml(active); setAppliedYaml(serializeMockConfig(parseMockConfig(active))) }
      else setAppliedYaml(null)
      setReady(true)
    }).catch(() => { if (alive.current && generation === statusGeneration.current) { setError('Could not read server status. Retry to reconnect.'); setReady(false) } })
    return () => { alive.current = false; importVersion.current++; statusGeneration.current++ }
  }, [initialAttempt])
  useEffect(() => {
    if (!api || !status.running) return
    const timer = setInterval(() => {
      if (document.hidden || polling.current || busy) return
      polling.current = true
      const generation = statusGeneration.current
      void api.status().then((value) => { if (alive.current && generation === statusGeneration.current) { setStatus(value); if (!value.running) setAppliedYaml(null) } }).catch(() => {
        if (alive.current && generation === statusGeneration.current) setError('Could not refresh server status. Reopen this tool to retry.')
      }).finally(() => { polling.current = false })
    }, 2000)
    return () => clearInterval(timer)
  }, [status.running, busy])

  const update = (next: MockConfig): void => {
    validateMockConfig(next)
    importVersion.current++
    setUndo(null)
    setYaml(serializeMockConfig(next)); setError('')
  }
  const run = async (operation: 'start' | 'apply' | 'stop' | 'clear'): Promise<void> => {
    if (!api || operationPending.current) return
    operationPending.current = true
    const snapshot = yaml
    statusGeneration.current++
    setBusy(true); setError('')
    try {
      const result = operation === 'start' ? await api.start(snapshot) : operation === 'apply' ? await api.apply(snapshot) : operation === 'stop' ? await api.stop() : await api.clearLogs()
      if (alive.current) {
        setStatus(result)
        if (operation === 'start' || operation === 'apply') setAppliedYaml(serializeMockConfig(parseMockConfig(snapshot)))
        else if (operation === 'stop') setAppliedYaml(null)
      }
    } catch (failure) { if (alive.current) setError(message(failure)) }
    finally { operationPending.current = false; if (alive.current) setBusy(false) }
  }
  const importFile = async (file: File | undefined): Promise<void> => {
    if (!file) return
    const version = ++importVersion.current
    try {
      if (file.size > MOCK_LIMITS.yamlBytes) throw new Error('YAML files must be at most 1 MiB.')
      const bytes = await file.arrayBuffer()
      let contents: string
      try { contents = new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
      catch { throw new Error('YAML files must use valid UTF-8 encoding.') }
      parseMockConfig(contents)
      if (!alive.current || version !== importVersion.current) return
      setYaml(contents); setSelected(''); setError(''); setUndo(null); setTab('Endpoints')
    } catch (failure) { if (alive.current && version === importVersion.current) setError(message(failure)) }
  }
  const editEndpoint = (value?: MockEndpoint): void => {
    setEndpointDraft(value ?? { id: newId(), name: 'New endpoint', method: 'GET', path: '/api/example', responses: [{ id: newId(), name: 'Default', status: 200, bodyType: 'json', body: { message: 'Hello from DevFusion' } }] })
  }
  const editResponse = (value?: MockResponse): void => {
    if (!endpoint) return
    setResponseDraft({ endpoint, response: value ?? { id: newId(), name: 'Error scenario', status: 500, when: { all: [{ source: 'header', key: 'x-scenario', operator: 'equals', value: 'error' }] }, bodyType: 'json', body: { error: 'Example failure' } } })
  }
  const modifyResponses = (responses: MockResponse[]): void => {
    if (config && endpoint) update({ ...config, endpoints: config.endpoints.map((entry) => entry.id === endpoint.id ? { ...entry, responses } : entry) })
  }
  const deleteEndpoint = (): void => {
    if (!config || !endpoint || config.endpoints.length <= 1) return
    update({ ...config, endpoints: config.endpoints.filter((entry) => entry.id !== endpoint.id) })
    setUndo({ yaml, selected: endpoint.id, message: `Endpoint “${endpoint.name}” removed from the draft.` })
  }
  const deleteResponse = (response: MockResponse): void => {
    if (!config || !endpoint || !response.when) return
    modifyResponses(endpoint.responses.filter((entry) => entry.id !== response.id))
    setUndo({ yaml, selected: endpoint.id, message: `Response “${response.name}” removed from the draft.` })
  }

  if (api && !ready) return <div className="space-y-3 p-4"><ToolStatus>{error || 'Reading active server configuration…'}</ToolStatus>{error && <button className="mac-btn-secondary" onClick={() => { setError(''); setInitialAttempt((attempt) => attempt + 1) }}>Retry status</button>}</div>

  return (
    <div className="flex h-full min-w-0 flex-col">
      <ToolToolbar>
        {status.running ? <button className="mac-btn-secondary" disabled={busy} onClick={() => void run('stop')}><Square size={14} />{uiText('Stop server')}</button>
          : <button className="mac-btn-primary" disabled={!api || !ready || busy || !config} onClick={() => void run('start')}><Play size={14} />Start server</button>}
        {status.running && <button className="mac-btn-primary" disabled={busy || !config || !hasPendingChanges || portChanged} title={portChanged ? 'Stop and start the server to change its port' : undefined} onClick={() => void run('apply')}><Check size={14} />Apply changes</button>}
        <ToolStatus tone={status.running ? 'success' : 'neutral'}>{busy ? uiText('Working…') : status.running ? `Serving ${status.name} · ${status.requests} requests` : 'Stopped · no listening port'}</ToolStatus>
        <div className="ml-auto flex flex-wrap gap-2">
          <button className="mac-btn-secondary" onClick={() => importRef.current?.click()}><Upload size={14} />Import YAML</button>
          <button className="mac-btn-secondary" disabled={!config} onClick={() => download(yaml)}><Download size={14} />Export YAML</button>
          <CopyButton text={yaml} label="Copy YAML" />
          <input ref={importRef} type="file" accept=".yaml,.yml,application/yaml,text/yaml" className="hidden" aria-label="Import Mock API YAML" onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = '' }} />
        </div>
      </ToolToolbar>
      <div className="shrink-0 space-y-2 border-b border-mac-separator px-4 py-3 text-[13px]">
        {status.baseUrl && <div className="flex flex-wrap items-center gap-2"><code className="selectable break-all text-mac-success">{status.baseUrl}</code><CopyButton text={status.baseUrl} label={uiText('Copy base URL')} /><span role="status" className={hasPendingChanges ? 'text-mac-warning' : 'text-mac-label-secondary'}>{hasPendingChanges ? portChanged ? 'Unapplied changes. Stop and start the server to change its port.' : 'Unapplied changes. Click Apply changes to serve this draft; the server is still using the previous configuration.' : 'All changes applied to the running server.'}</span></div>}
        <p className="text-mac-label-secondary">Export YAML to keep your draft. A started server stays active in the tray until Stop or Quit.</p>
        {undo && <div className="flex flex-wrap items-center gap-2 rounded-mac-lg bg-mac-control px-3 py-2"><span role="status" className="min-w-0 flex-1">{undo.message}</span><button type="button" className="mac-btn-secondary" onClick={() => { importVersion.current++; setYaml(undo.yaml); setSelected(undo.selected); setUndo(null); setError('') }}><Undo2 size={14} />Undo delete</button></div>}
        {!api && <p role="alert" className="text-mac-warning">Starting a server requires the DevFusion desktop app. You can still build, import, export and try rules here.</p>}
        {error && <p role="alert" className="break-words text-mac-danger">{error}</p>}
        {parsed.error && <p role="alert" className="break-words text-mac-danger">{parsed.error}</p>}
      </div>
      <div className="shrink-0 border-b border-mac-separator px-4 py-3"><div role="tablist" aria-label="Mock API views" className="mac-segment !flex !flex-wrap" onKeyDown={(event) => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const index = tabs.indexOf(tab); const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; setTab(tabs[next]!); event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus() }}>
        {tabs.map((value, index) => <button key={value} id={`mock-api-tab-${index}`} role="tab" aria-selected={tab === value} aria-controls="mock-api-panel" tabIndex={tab === value ? 0 : -1} data-active={tab === value} className="mac-segment-item" onClick={() => setTab(value)}>{value}</button>)}
      </div>
      </div>
      <div id="mock-api-panel" role="tabpanel" aria-label={tab} aria-labelledby={`mock-api-tab-${tabs.indexOf(tab)}`} tabIndex={0} className="min-h-0 flex-1 overflow-auto p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-mac-accent">
        {tab === 'YAML' && <div className="flex h-full min-h-[320px] flex-col gap-2"><p className="text-[13px] text-mac-label-secondary">Version 1 · first matching response wins · last response is the fallback. {runShortcut.binding && `${formatShortcut(runShortcut.binding, runShortcut.platform)} ${status.running ? 'applies changes' : 'starts the server'}.`}</p><CodeEditor value={yaml} onChange={(value) => { importVersion.current++; setUndo(null); setYaml(value) }} language="yaml" label="Mock API YAML" issue={parsed.error ? { error: parsed.error } : null} onRun={() => { if (config && ready && !portChanged && (!status.running || hasPendingChanges)) void run(status.running ? 'apply' : 'start') }} /><button className="mac-btn-secondary self-start" onClick={() => { importVersion.current++; setUndo(null); setYaml(MOCK_EXAMPLE_YAML); setError('') }}>Load example configuration</button></div>}
        {tab === 'Endpoints' && config && <div className="space-y-5">
          <ServerSettings key={config.name + config.port + config.cors.enabled + config.cors.origins.join(',')} config={config} onSave={update} />
          <div className="grid min-w-0 gap-4 lg:grid-cols-[230px_minmax(0,1fr)]">
            <div className="space-y-2"><div className="flex items-center justify-between"><h2 className="text-[14px] font-semibold">Endpoints ({config.endpoints.length})</h2><button className="mac-btn-secondary" disabled={config.endpoints.length >= MOCK_LIMITS.endpoints} onClick={() => editEndpoint()} aria-label="Add endpoint"><Plus size={14} /></button></div>
              {config.endpoints.map((entry) => <button key={entry.id} aria-pressed={entry.id === endpoint?.id} className={`w-full rounded-mac-lg border p-3 text-left ${entry.id === endpoint?.id ? 'border-mac-accent bg-mac-accent/10' : 'border-mac-separator bg-mac-surface'}`} onClick={() => setSelected(entry.id)}><span className="text-[12px] font-semibold text-mac-accent">{entry.method}</span><code className="ml-2 break-all text-[13px]">{entry.path}</code><div className="mt-1 text-[13px] text-mac-label-secondary">{entry.name}</div></button>)}
            </div>
            {endpoint && <div className="min-w-0 space-y-3"><div className="flex flex-wrap items-center gap-2"><h2 className="mr-auto text-[14px] font-semibold">{endpoint.name}</h2><button className="mac-btn-secondary" onClick={() => editEndpoint(endpoint)}>Edit endpoint</button><button className="mac-btn-ghost text-mac-danger" disabled={config.endpoints.length <= 1} onClick={deleteEndpoint} aria-label="Delete endpoint" title={config.endpoints.length <= 1 ? 'Keep at least one endpoint in this configuration' : 'Delete endpoint'}><Trash2 size={14} /></button><button className="mac-btn-secondary" disabled={endpoint.responses.length >= MOCK_LIMITS.responses} onClick={() => editResponse()}><Plus size={14} />Add response</button></div>
              <p className="text-[13px] text-mac-label-secondary">Checked from top to bottom. The first matching rule wins; fallback stays last.</p>
              <CopyButton text={(status.baseUrl ?? `http://127.0.0.1:${config.port}`) + endpoint.path} label="Copy endpoint URL" />
              {endpoint.responses.map((response, index) => <div key={response.id} className="min-w-0 rounded-mac-lg border border-mac-separator bg-mac-surface p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <span className={`rounded-mac px-2.5 py-1 font-mono text-[14px] font-semibold ${response.status >= 400 ? 'bg-mac-warning/10 text-mac-warning' : 'bg-mac-success/10 text-mac-success'}`}>{response.status}</span>
                  <div className="min-w-0 flex-1"><h3 className="break-words text-[14px] font-semibold">{index + 1}. {response.name}</h3><p className="mt-1 text-[13px] text-mac-label-secondary">{response.when ? 'Conditional response' : 'Fallback response'} · {response.bodyType ?? 'json'} · {response.delayMs ? `${response.delayMs} ms delay` : 'No delay'}</p></div>
                  <div className="flex flex-wrap gap-1"><button className="mac-btn-secondary" onClick={() => editResponse(response)} aria-label={`Edit response ${response.name}`}>Edit</button><button className="mac-btn-ghost" disabled={!response.when || index === 0} aria-label={`Move up ${response.name}`} title="Check this rule earlier" onClick={() => { const list = [...endpoint.responses]; [list[index - 1], list[index]] = [list[index]!, list[index - 1]!]; modifyResponses(list) }}><ArrowUp size={14} /></button><button className="mac-btn-ghost" disabled={!response.when || index >= endpoint.responses.length - 2} aria-label={`Move down ${response.name}`} title="Check this rule later" onClick={() => { const list = [...endpoint.responses]; [list[index + 1], list[index]] = [list[index]!, list[index + 1]!]; modifyResponses(list) }}><ArrowDown size={14} /></button><button className="mac-btn-ghost text-mac-danger" disabled={!response.when} aria-label={`Delete response ${response.name}`} title={response.when ? 'Delete response' : 'The final fallback is required'} onClick={() => deleteResponse(response)}><Trash2 size={14} /></button></div>
                </div>
                {response.when ? <div className="mt-3 space-y-3 text-[14px]">
                  {response.when.all?.length ? <div><p className="mb-1 font-medium text-mac-label-secondary">When all of these match</p>{response.when.all.map((condition, position) => <p key={`all-${position}`} className="selectable break-words pl-3 leading-relaxed">{conditionLabel(condition)}</p>)}</div> : null}
                  {response.when.any?.length ? <div><p className="mb-1 font-medium text-mac-label-secondary">{response.when.all?.length ? 'And at least one of these matches' : 'When at least one of these matches'}</p>{response.when.any.map((condition, position) => <p key={`any-${position}`} className="selectable break-words pl-3 leading-relaxed">{conditionLabel(condition)}</p>)}</div> : null}
                </div> : <p className="mt-3 text-[14px] text-mac-label-secondary">Used when no earlier rule matches. This response always stays last.</p>}
                <pre className="selectable mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-mac-control p-2 font-mono text-[12px]">{response.bodyType === 'text' ? String(response.body ?? '') : JSON.stringify(response.body ?? null, null, 2)}</pre>
                {Object.keys(response.headers ?? {}).length > 0 && <pre className="selectable mt-2 overflow-auto whitespace-pre-wrap break-all font-mono text-[12px] text-mac-label-secondary">{JSON.stringify(response.headers, null, 2)}</pre>}
              </div>)}
            </div>}
          </div>
        </div>}
        {tab === 'Endpoints' && !config && <div className="max-w-xl space-y-3 rounded-mac-lg border border-mac-separator bg-mac-surface p-5"><h2 className="font-semibold">Your configuration needs a small fix</h2><p className="text-[14px] text-mac-label-secondary">Open YAML to see the error and correct it. Your draft is still here.</p><button type="button" className="mac-btn-secondary" onClick={() => setTab('YAML')}>Review YAML errors</button></div>}
        {tab === 'Try rules' && <RuleTester config={config} />}
        {tab === 'Activity' && <div className="space-y-3"><div className="flex flex-wrap items-center gap-3"><h2 className="text-[14px] font-semibold">Recent requests ({status.logs.length}/{MOCK_LIMITS.logs})</h2><button className="mac-btn-secondary" disabled={!api || busy || !status.logs.length} onClick={() => void run('clear')}>Clear activity</button></div><p className="text-[13px] text-mac-label-secondary">Only method, registered route, chosen rule, status and timing. Request URLs, headers, query values and bodies are omitted. Updates every 2 seconds while this tool is open and visible.</p>{status.logs.length ? <div className="overflow-x-auto"><table className="w-full text-left text-[13px]"><thead><tr>{['Time', 'Method', 'Route', 'Rule', 'Status', 'ms'].map((label) => <th key={label} className="border-b border-mac-separator p-2">{label}</th>)}</tr></thead><tbody>{[...status.logs].reverse().map((log) => <tr key={log.id}><td className="p-2">{new Date(log.time).toLocaleTimeString()}</td><td className="p-2 font-mono">{log.method}</td><td className="max-w-48 break-all p-2 font-mono">{log.endpoint}</td><td className="p-2">{log.rule}</td><td className="p-2 font-mono">{log.status}</td><td className="p-2">{Math.round(log.durationMs)}</td></tr>)}</tbody></table></div> : <p className="rounded-mac-lg border border-mac-separator p-4 text-[14px] text-mac-label-secondary">No requests yet. Start the server and point your frontend at its base URL.</p>}</div>}
        {tab === 'Guide' && <Guide />}
      </div>
      {endpointDraft && config && <EndpointEditor draft={endpointDraft} onClose={() => setEndpointDraft(null)} onSave={(value) => { const exists = config.endpoints.some((entry) => entry.id === value.id); update({ ...config, endpoints: exists ? config.endpoints.map((entry) => entry.id === value.id ? value : entry) : [...config.endpoints, value] }); setSelected(value.id); setEndpointDraft(null) }} />}
      {responseDraft && config && <ResponseEditor draft={responseDraft.response} onClose={() => setResponseDraft(null)} onSave={(value) => { const parent = responseDraft.endpoint; const exists = parent.responses.some((entry) => entry.id === value.id); const responses = exists ? parent.responses.map((entry) => entry.id === value.id ? value : entry) : [...parent.responses.slice(0, -1), value, parent.responses[parent.responses.length - 1]!]; update({ ...config, endpoints: config.endpoints.map((entry) => entry.id === parent.id ? { ...entry, responses } : entry) }); setResponseDraft(null) }} />}
    </div>
  )
}

function ServerSettings({ config, onSave }: { config: MockConfig; onSave: (config: MockConfig) => void }): JSX.Element {
  useUiLocale()
  const [name, setName] = useState(config.name)
  const [port, setPort] = useState(String(config.port))
  const [cors, setCors] = useState(config.cors.enabled)
  const [origins, setOrigins] = useState(config.cors.origins.join('\n'))
  const [error, setError] = useState('')
  return <details className="rounded-mac-lg border border-mac-separator bg-mac-surface"><summary className="cursor-pointer rounded-mac-lg p-3 text-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-mac-accent"><strong>Server settings</strong><span className="ml-2 text-mac-label-secondary">{config.name} · port {config.port} · {config.cors.enabled ? 'CORS enabled' : 'CORS disabled'}</span></summary><form className="space-y-3 border-t border-mac-separator p-4" onSubmit={(event) => { event.preventDefault(); try { onSave({ ...config, name, port: Number(port), cors: { enabled: cors, origins: origins.split('\n').map((entry) => entry.trim()).filter(Boolean) } }); setError('') } catch (failure) { setError(message(failure)) } }}>
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]"><label className="text-[13px]">Server name<input className="mac-input mt-1" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} /></label><label className="text-[13px]">Port<input className="mac-input mt-1" type="number" min={1024} max={65535} value={port} onChange={(event) => setPort(event.target.value)} /></label></div>
    <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={cors} onChange={(event) => setCors(event.target.checked)} />Allow browser frontends with CORS</label>
    <label className="block text-[13px]">Allowed origins · one per line<textarea className="mac-input mt-1 h-16 resize-y font-mono" value={origins} maxLength={8192} onChange={(event) => setOrigins(event.target.value)} spellCheck={false} /></label>
    <p className="text-[12px] text-mac-label-secondary">Default: localhost and 127.0.0.1 on any port. Add exact origins such as https://example.test. Server binds only 127.0.0.1; browser credentials/cookies are not enabled.</p>
    {error && <p role="alert" className="text-[13px] text-mac-danger">{error}</p>}<button className="mac-btn-secondary" type="submit">Apply server settings</button>
  </form></details>
}

function EndpointEditor({ draft, onClose, onSave }: { draft: MockEndpoint; onClose: () => void; onSave: (draft: MockEndpoint) => void }): JSX.Element {
  useUiLocale()
  const [value, setValue] = useState(draft)
  const [error, setError] = useState('')
  return <Modal open title="Endpoint" description="Use exact routes or named path parameters such as /api/users/:id." onClose={onClose}><form className="space-y-3" onSubmit={(event) => { event.preventDefault(); try { onSave(value) } catch (failure) { setError(message(failure)) } }}>
    <label className="block text-[13px]">Endpoint name<input className="mac-input mt-1" value={value.name} maxLength={120} onChange={(event) => setValue({ ...value, name: event.target.value })} /></label>
    <label className="block text-[13px]">Method<select aria-label="Method" className="mac-input mt-1" value={value.method} onChange={(event) => setValue({ ...value, method: event.target.value as MockEndpoint['method'] })}>{MOCK_METHODS.map((method) => <option key={method}>{method}</option>)}</select></label>
    <label className="block text-[13px]">Path<input className="mac-input mt-1 font-mono" value={value.path} maxLength={2048} onChange={(event) => setValue({ ...value, path: event.target.value })} /></label>
    {error && <p role="alert" className="text-[13px] text-mac-danger">{error}</p>}<div className="flex justify-end gap-2"><button type="button" className="mac-btn-secondary" onClick={onClose}>{uiText('Cancel')}</button><button type="submit" className="mac-btn-primary">Save endpoint</button></div>
  </form></Modal>
}

function ResponseEditor({ draft, onClose, onSave }: { draft: MockResponse; onClose: () => void; onSave: (draft: MockResponse) => void }): JSX.Element {
  useUiLocale()
  const [name, setName] = useState(draft.name)
  const [status, setStatus] = useState(String(draft.status))
  const [delay, setDelay] = useState(String(draft.delayMs ?? 0))
  const [bodyType, setBodyType] = useState(draft.bodyType ?? 'json')
  const [body, setBody] = useState(draft.bodyType === 'text' ? String(draft.body ?? '') : JSON.stringify(draft.body ?? null, null, 2))
  const [headers, setHeaders] = useState(JSON.stringify(draft.headers ?? {}, null, 2))
  const [all, setAll] = useState(draft.when?.all ?? [])
  const [any, setAny] = useState(draft.when?.any ?? [])
  const [error, setError] = useState('')
  return <Modal open title="Response rule" description={draft.when ? 'ALL conditions must pass, plus at least one ANY condition when present. Responses are checked in order.' : 'This is the final fallback response. It runs when no earlier rule matches.'} onClose={onClose} className="max-w-2xl"><form className="space-y-4" onSubmit={(event) => {
    event.preventDefault()
    try {
      let headerValues: Record<string, string>, bodyValue: JsonValue
      try { headerValues = JSON.parse(headers) } catch { throw new Error('Response headers must be a JSON object with string values.') }
      try { bodyValue = bodyType === 'json' ? JSON.parse(body) : body } catch { throw new Error('Response body must be valid JSON. Choose Text for a plain-text response.') }
      onSave({ ...draft, name, status: Number(status), delayMs: Number(delay), bodyType, body: bodyValue, headers: headerValues, ...(draft.when ? { when: { ...(all.length ? { all } : {}), ...(any.length ? { any } : {}) } } : {}) })
    } catch (failure) { setError(message(failure)) }
  }}>
    <label className="block text-[13px]">Response name<input className="mac-input mt-1" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} /></label>
    <div className="grid grid-cols-2 gap-3"><label className="text-[13px]">Status code<input className="mac-input mt-1" type="number" min={200} max={599} value={status} onChange={(event) => setStatus(event.target.value)} /></label><label className="text-[13px]">Delay (milliseconds)<input className="mac-input mt-1" type="number" min={0} max={10000} value={delay} onChange={(event) => setDelay(event.target.value)} /></label></div>
    {draft.when && <><ConditionList label="ALL" values={all} onChange={setAll} /><ConditionList label="ANY" values={any} onChange={setAny} /></>}
    <label className="block text-[13px]">Response headers (JSON object)<textarea aria-label="Response headers" className="mac-input mt-1 h-20 resize-y font-mono" spellCheck={false} value={headers} maxLength={65536} onChange={(event) => setHeaders(event.target.value)} /></label>
    <label className="block text-[13px]">Body format<select aria-label="Body format" className="mac-input mt-1" value={bodyType} onChange={(event) => setBodyType(event.target.value as 'json' | 'text')}><option value="json">JSON</option><option value="text">Text</option></select></label>
    <div className="h-48"><CodeEditor value={body} onChange={setBody} language={bodyType === 'json' ? 'json' : 'text'} label="Response body" /></div>
    {error && <p role="alert" className="text-[13px] text-mac-danger">{error}</p>}<div className="flex justify-end gap-2"><button type="button" className="mac-btn-secondary" onClick={onClose}>{uiText('Cancel')}</button><button type="submit" className="mac-btn-primary">Save response</button></div>
  </form></Modal>
}

function ConditionList({ label, values, onChange }: { label: string; values: MockCondition[]; onChange: (values: MockCondition[]) => void }): JSX.Element {
  useUiLocale()
  const edit = (index: number, value: MockCondition): void => onChange(values.map((entry, position) => position === index ? value : entry))
  return <fieldset className="space-y-2 rounded-mac-lg border border-mac-separator p-3"><legend className="px-1 text-[13px] font-semibold">{label} conditions</legend>
    <p className="pb-1 text-[13px] leading-relaxed text-mac-label-secondary">{label === 'ALL' ? 'Every condition below must match the request.' : 'At least one condition below must match. Leave empty if no alternative condition is needed.'}</p>
    {values.map((condition, index) => <div key={index} className="space-y-2 border-b border-mac-separator pb-3 last:border-0"><div className="grid grid-cols-[minmax(0,1fr)_36px] gap-2 sm:grid-cols-[100px_minmax(0,1fr)_150px_36px]">
      <select aria-label={`${label} condition ${index + 1} source`} className="mac-input col-span-2 !px-2 sm:col-span-1" value={condition.source} onChange={(event) => edit(index, { ...condition, source: event.target.value as MockCondition['source'] })}>{MOCK_CONDITION_SOURCES.map((source) => <option key={source}>{source}</option>)}</select>
      <input aria-label={`${label} condition ${index + 1} key`} className="mac-input col-span-2 font-mono sm:col-span-1" placeholder={condition.source === 'body' ? '/name' : condition.source === 'header' ? 'authorization' : 'role'} value={condition.key} maxLength={256} onChange={(event) => edit(index, { ...condition, key: event.target.value })} />
      <select aria-label={`${label} condition ${index + 1} operator`} className="mac-input !px-2" value={condition.operator} onChange={(event) => { const operator = event.target.value as MockCondition['operator']; const { value, ...rest } = condition; edit(index, ['exists', 'missing'].includes(operator) ? { ...rest, operator } : { ...condition, operator, value: value ?? '' }) }}>{MOCK_CONDITION_OPERATORS.map((operator) => <option key={operator} value={operator}>{operatorLabels[operator]}</option>)}</select>
      <button type="button" className="mac-btn-secondary !px-2" aria-label={`Delete ${label} condition ${index + 1}`} onClick={() => onChange(values.filter((_, position) => position !== index))}><Trash2 size={12} /></button>
    </div>{!['exists', 'missing'].includes(condition.operator) && <div className="grid grid-cols-[95px_minmax(0,1fr)] gap-2"><select aria-label={`${label} condition ${index + 1} value type`} className="mac-input !px-2" value={condition.value === null ? 'null' : typeof condition.value} onChange={(event) => { const kind = event.target.value; edit(index, { ...condition, value: kind === 'null' ? null : kind === 'boolean' ? true : kind === 'number' ? 0 : '' }) }}><option value="string">Text</option><option value="number">Number</option><option value="boolean">Boolean</option><option value="null">Null</option></select>{typeof condition.value === 'boolean' ? <select aria-label={`${label} condition ${index + 1} value`} className="mac-input" value={String(condition.value)} onChange={(event) => edit(index, { ...condition, value: event.target.value === 'true' })}><option>true</option><option>false</option></select> : <input aria-label={`${label} condition ${index + 1} value`} className="mac-input" disabled={condition.value === null} value={condition.value ?? ''} type={typeof condition.value === 'number' ? 'number' : 'text'} maxLength={8192} onChange={(event) => edit(index, { ...condition, value: typeof condition.value === 'number' ? Number(event.target.value) : event.target.value })} />}</div>}</div>)}
    <button type="button" className="mac-btn-secondary" disabled={values.length >= MOCK_LIMITS.conditions} onClick={() => onChange([...values, { source: 'header', key: 'authorization', operator: 'missing' }])}><Plus size={12} />Add {label} condition</button>
    <p className="text-[13px] leading-relaxed text-mac-label-secondary">For a body field, use its path: /user/role reads the role inside user. Choose Number for numeric comparisons. “Is present” includes null; “is missing” means the field was not sent.</p>
  </fieldset>
}

function RuleTester({ config }: { config: MockConfig | null }): JSX.Element {
  useUiLocale()
  const [method, setMethod] = useState('GET')
  const [path, setPath] = useState('/api/users?role=admin')
  const [headers, setHeaders] = useState('{"authorization":"Bearer example"}')
  const [body, setBody] = useState('')
  const [result, setResult] = useState('')
  const [error, setError] = useState('')
  const clear = (): void => { setResult(''); setError('') }
  useEffect(clear, [config])
  return <form className="max-w-3xl space-y-4" onSubmit={(event) => {
    event.preventDefault(); clear()
    try {
      if (!config) throw new Error('Fix the configuration first.')
      if (!path.startsWith('/') || path.startsWith('//') || path.length > 8192) throw new Error('Use a local request path, such as /api/users?role=admin.')
      let headerValues: Record<string, string>
      try { headerValues = JSON.parse(headers) } catch { throw new Error('Request headers must be valid JSON.') }
      if (!headerValues || Array.isArray(headerValues) || typeof headerValues !== 'object' || Object.values(headerValues).some((value) => typeof value !== 'string')) throw new Error('Request headers must be a JSON object with string values.')
      const target = parseMockTarget(path)
      let bodyValue: JsonValue | undefined
      try {
        if (body.length > MOCK_LIMITS.requestBytes || new TextEncoder().encode(body).byteLength > MOCK_LIMITS.requestBytes) throw new Error('Body too large')
        bodyValue = body.trim() ? validateMockJson(JSON.parse(body), 'Request body') : undefined
      } catch { throw new Error('Request body must be valid bounded JSON, or empty; maximum 1 MiB/depth 20, no reserved keys.') }
      const request = { method, path: target.path, headers: headerValues, query: target.query, body: bodyValue }
      const match = matchMockRequest(config, request) ?? (method === 'HEAD' ? matchMockRequest(config, { ...request, method: 'GET' }) : null)
      setResult(match ? `${match.endpoint.method} ${match.endpoint.path}\nRule: ${match.response.name}\nStatus: ${match.response.status}\nDelay: ${match.response.delayMs ?? 0} ms\n\n${method === 'HEAD' || [204, 205, 304].includes(match.response.status) ? '(No response body)' : match.response.bodyType === 'text' ? String(match.response.body ?? '') : JSON.stringify(match.response.body ?? null, null, 2)}` : 'No matching endpoint. The server returns 404, or 405 if this path supports another method.')
    } catch (failure) { setError(message(failure)) }
  }}>
    <p className="text-[14px] text-mac-label-secondary">Simulate rule matching locally against the current draft. This sends no HTTP request and does not add activity.</p>
    <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3"><label className="text-[13px]">Method<select aria-label="Method" className="mac-input mt-1" value={method} onChange={(event) => { setMethod(event.target.value); clear() }}>{MOCK_METHODS.map((value) => <option key={value}>{value}</option>)}</select></label><label className="text-[13px]">Request path + query<input className="mac-input mt-1 font-mono" value={path} maxLength={8192} onChange={(event) => { setPath(event.target.value); clear() }} /></label></div>
    <label className="block text-[13px]">Request headers (JSON object)<textarea className="mac-input mt-1 h-20 font-mono" value={headers} maxLength={65536} onChange={(event) => { setHeaders(event.target.value); clear() }} /></label>
    <label className="block text-[13px]">Request body (JSON, optional)<textarea className="mac-input mt-1 h-24 font-mono" value={body} maxLength={MOCK_LIMITS.requestBytes} onChange={(event) => { setBody(event.target.value); clear() }} /></label>
    <button className="mac-btn-primary" disabled={!config} type="submit">Match response</button>
    {error && <p role="alert" className="text-[13px] text-mac-danger">{error}</p>}{result && <pre role="status" className="selectable whitespace-pre-wrap break-all rounded-mac-lg border border-mac-separator bg-mac-surface p-4 font-mono text-[13px]">{result}</pre>}
  </form>
}

function Guide(): JSX.Element {
  useUiLocale()
  return <div className="max-w-3xl space-y-4 text-[14px] leading-relaxed"><h2 className="text-[16px] font-semibold">Connect your frontend while the backend is being built</h2><ol className="list-decimal space-y-2 pl-5"><li>Define endpoints in the form or YAML. Use named path parameters such as <code>/api/users/:id</code>.</li><li>Add response rules: missing authorization → 401, role filter → a filtered list, invalid JSON field → 422. Put specific rules before broader ones.</li><li>Use Try rules to verify headers, query and body conditions. The last response is the unconditional fallback.</li><li>Start the server and set your frontend API base URL to <code>http://127.0.0.1:PORT</code>. The example uses port 4010. Local development origins are allowed by default.</li><li>Use Apply changes after editing a running server. Only port changes require Stop, then Start. Export YAML to save or share your contract; import reloads it without starting a server.</li></ol>
    <div className="rounded-mac-lg border border-mac-separator bg-mac-surface p-4"><h3 className="mb-2 font-semibold">Condition behavior</h3><ul className="list-disc space-y-1 pl-4"><li>ALL must all pass; ANY requires at least one match. If both are present, both groups must pass.</li><li>Header names ignore case. Repeated query values match when any one value passes the operator.</li><li>Body conditions use JSON Pointer: <code>/user/role</code>, <code>/items/0/id</code>, and an empty key for the root. Null is present; missing is absent.</li><li>Body equals checks the value type. For gt/gte/lt/lte, choose Number. Date strings compare as text only.</li><li>Routes are checked in YAML order. Put fixed routes such as <code>/users/me</code> before <code>/users/:id</code>. HEAD falls back to GET and sends no body.</li><li>Response headers and JSON/text bodies are static values. Delays are capped at 10 seconds; request/response bodies at 1 MiB. Scripts, regular expressions and proxying are unavailable.</li></ul></div>
    <div className="rounded-mac-lg border border-mac-separator p-4"><h3 className="mb-2 font-semibold">Browser example</h3><pre className="selectable overflow-auto whitespace-pre-wrap break-all font-mono text-[13px]">{'fetch("http://127.0.0.1:4010/api/users?role=admin", {\n  headers: { Authorization: "Bearer example" }\n}).then(response => response.json())'}</pre><p className="mt-2 text-mac-label-secondary">Use fetch without credentials. Add an exact CORS origin for a non-local frontend; HTTPS pages may block HTTP mixed content. This server is for local development and exposes no LAN listener.</p></div>
    <p className="text-mac-label-secondary">No automatic disk save or request-content logging. Exported YAML is plaintext and includes any configured headers/body values. Use sample values when sharing it.</p>
  </div>
}
