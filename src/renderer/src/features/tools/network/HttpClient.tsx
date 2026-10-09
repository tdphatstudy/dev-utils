import { messageKey } from '@shared/i18n/message-key'
import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Send, Code2 } from 'lucide-react'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { KeyValueEditor } from '@renderer/components/ui/KeyValueEditor'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import { buildHttpPayload, methodAllowsBody, newRow } from '@shared/http/build-request'
import { validateHttpPayload } from '@shared/http/validation'
import { parseJson } from '@shared/json'
import { formatJsonText } from '@shared/json/format-text'
import { generateSnippet, SNIPPETS, type SnippetId } from '@shared/http/snippets'
import type {
  BodyMode,
  HttpMethod,
  HttpRequestModel,
  HttpResponsePayload,
  KeyValueRow
} from '@shared/http/types'
import { cn, formatBytes } from '@renderer/lib/utils'
import { SaveToBoxButton } from '@renderer/features/secret-box/SaveToBoxButton'
import { useShortcut, useToolShortcuts } from '@renderer/shortcuts/useShortcuts'
import { formatShortcut } from '@shared/shortcuts'

type RequestTab = 'params' | 'headers' | 'body'
type ResponseTab = 'body' | 'headers' | 'code'
type StatusTone = 'neutral' | 'success' | 'danger' | 'warning'

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

const BODY_MODES: { value: BodyMode; label: string }[] = [
  { value: 'none', label: messageKey('None') },
  { value: 'json', label: 'JSON' },
  { value: 'text', label: messageKey('Raw') },
  { value: 'urlencoded', label: messageKey('x-www-form-urlencoded') },
  { value: 'form', label: messageKey('Form data') }
]

export default function HttpClient(): JSX.Element {
  useUiLocale()
  const [method, setMethod] = useState<HttpMethod>('GET')
  const [url, setUrl] = useState('https://httpbin.org/get')
  const [query, setQuery] = useState<KeyValueRow[]>([newRow()])
  const [headers, setHeaders] = useState<KeyValueRow[]>([
    newRow('Accept', 'application/json'),
    newRow()
  ])
  const [bodyMode, setBodyMode] = useState<BodyMode>('none')
  const [bodyText, setBodyText] = useState('{\n  "hello": "world"\n}')
  const [formRows, setFormRows] = useState<KeyValueRow[]>([newRow(), newRow()])

  const [requestTab, setRequestTab] = useState<RequestTab>('params')
  const [responseTab, setResponseTab] = useState<ResponseTab>('body')
  const [snippetId, setSnippetId] = useState<SnippetId>('curl')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [response, setResponse] = useState<HttpResponsePayload | null>(null)
  const [timeout, setTimeoutValue] = useState(30000)
  const [pretty, setPretty] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [canceled, setCanceled] = useState(false)
  const running = useRef(false)
  const request = useRef(0)
  const job = useRef<string | null>(null)
  const cancellation = useRef(false)
  const available = !!window.devutils?.net?.httpRequest
  useEffect(() => () => {
    request.current++
    if (job.current) void window.devutils.net.cancelHttpRequest(job.current).catch(() => {})
  }, [])

  const model: HttpRequestModel = useMemo(
    () => ({
      method,
      url,
      headers,
      query,
      bodyMode: methodAllowsBody(method) ? bodyMode : 'none',
      bodyText,
      formRows
    }),
    [method, url, headers, query, bodyMode, bodyText, formRows]
  )

  const payload = useMemo(() => ({ ...buildHttpPayload(model), timeoutMs: timeout }), [model, timeout])
  const snippet = useMemo(() => responseTab === 'code' ? generateSnippet(snippetId, payload) : '', [responseTab, snippetId, payload])
  const bodyIssue = model.bodyMode === 'json' ? parseJson(bodyText) : null
  const validationError = validateHttpPayload(payload) ?? (bodyIssue && !bodyIssue.ok ? `JSON body: ${bodyIssue.error}${bodyIssue.line ? ` · line ${bodyIssue.line}, column ${bodyIssue.column}` : ''}. Select Raw to intentionally send malformed JSON.` : null)
  useEffect(() => { setResponse(null); setError(null); setCanceled(false) }, [payload])

  const prettyBody = useMemo(() => {
    if (!response?.bodyText) return ''
    return pretty && response.bodyEncoding === 'utf8' ? formatJsonText(response.bodyText) : response.bodyText
  }, [response, pretty])

  const responseHeadersJson = useMemo(
    () => (response ? JSON.stringify(response.headers, null, 2) : ''),
    [response]
  )
  const responseIsJson = useMemo(() => !!response && response.bodyEncoding === 'utf8' && parseJson(response.bodyText).ok, [response])

  const send = async (): Promise<void> => {
    if (running.current || !available || validationError) return
    running.current = true
    const version = ++request.current
    const id = crypto.randomUUID()
    job.current = id
    cancellation.current = false
    setCanceling(false)
    setCanceled(false)
    setBusy(true)
    setError(null)
    setResponse(null)
    try {
      if (!window.devutils?.net?.httpRequest) {
        throw new Error('HTTP requests are unavailable. Restart DevFusion and try again.')
      }
      const res = await window.devutils.net.httpRequest(payload, id)
      if (version !== request.current) return
      if (cancellation.current) setCanceled(true)
      else { setResponse(res); setPretty(false); setResponseTab('body') }
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : typeof e === 'object' && e && 'message' in e
            ? String((e as { message: unknown }).message)
            : 'Request failed'
      if (version === request.current) {
        if (cancellation.current) setCanceled(true)
        else setError(message)
      }
    } finally {
      running.current = false
      job.current = null
      if (version === request.current) setBusy(false)
    }
  }

  const cancel = async (): Promise<void> => {
    const id = job.current
    if (!id || cancellation.current) return
    cancellation.current = true
    setCanceling(true)
    try { await window.devutils.net.cancelHttpRequest(id) }
    catch (e) {
      cancellation.current = false
      if (job.current === id) { setCanceling(false); setError(e instanceof Error ? e.message : 'Could not cancel this request.') }
    }
  }

  const onMethodChange = (m: HttpMethod): void => {
    setMethod(m)
    if (!methodAllowsBody(m)) {
      setBodyMode('none')
      if (requestTab === 'body') setRequestTab('params')
    } else if (bodyMode === 'none' && (m === 'POST' || m === 'PUT' || m === 'PATCH')) {
      setBodyMode('json')
      setRequestTab('body')
    }
  }

  const statusTone: StatusTone = error || validationError
    ? 'danger'
    : response
      ? response.ok
        ? 'success'
        : 'warning'
      : 'neutral'

  const statusText = error || validationError
    ? error ?? validationError
    : busy
      ? canceling ? 'Canceling request…' : `Sending… timeout ${timeout / 1000}s`
      : response
        ? `${response.status} ${response.statusText} · ${response.timeMs}ms · ${formatBytes(response.size)}`
        : canceled ? 'Canceled · no response retained' : !available ? 'Open the desktop app to send HTTP requests.' : 'User-initiated · 5 MB response limit · redirects returned for inspection'

  const runShortcut = useShortcut('editor.run')
  useToolShortcuts({ 'editor.run': () => { void send() } }, available && !busy && !validationError)
  return (
    <div className="flex h-full flex-col">
      <ToolToolbar className="gap-2">
        <div className="flex min-w-0 w-full flex-1 flex-wrap items-center gap-2 sm:flex-nowrap">
          <select
            aria-label={uiText('HTTP method')}
            disabled={busy}
            className={cn(
              'mac-input !w-[100px] shrink-0 !py-1.5 font-mono text-[13px] font-semibold sm:!w-[110px]',
              methodColor(method)
            )}
            value={method}
            onChange={(e) => onMethodChange(e.target.value as HttpMethod)}
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <input
            aria-label={uiText('HTTP request URL')}
            aria-invalid={!!validateHttpPayload(payload)}
            disabled={busy}
            className="mac-input min-w-0 flex-1 basis-[12rem] font-mono text-[14px]"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://api.example.com/v1/…"
            spellCheck={false}
          />
          <button
            type="button"
            className="mac-btn-primary shrink-0 !px-3 sm:!px-4"
            disabled={busy || !!validationError || !available}
            onClick={() => void send()}
          >
            <Send className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{busy ? uiText('Sending…') : uiText('Send')}</span>
            <span className="sm:hidden">{busy ? '…' : uiText('Go')}</span>
          </button>
          {busy && <button type="button" className="mac-btn-secondary" disabled={canceling} onClick={() => void cancel()}>{canceling ? uiText('Canceling…') : uiText('Cancel')}</button>}
        </div>
      </ToolToolbar>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-mac-separator px-3 py-2 text-[12px] text-mac-label-secondary">
        <label>{uiText('Timeout')} <select aria-label={uiText('HTTP timeout')} className="mac-input !w-auto !py-1" disabled={busy} value={timeout} onChange={(e) => setTimeoutValue(Number(e.target.value))}>{[5000, 15000, 30000, 60000].map((value) => <option key={value} value={value}>{value / 1000}s</option>)}</select></label>
        <span>{uiText('Redirects are shown as responses. Follow the Location header with a new request.')}</span>
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(280px,1fr)_minmax(220px,1fr)] overflow-auto divide-y divide-mac-separator">
        <fieldset disabled={busy} className="flex min-h-[280px] min-w-0 flex-col">
          <div role="tablist" aria-label={uiText('HTTP request sections')} onKeyDown={navigateTabs} className="flex shrink-0 items-center gap-1 border-b border-mac-separator px-2">
            <TabBtn id="http-request-tab-params" panel="http-request-panel" active={requestTab === 'params'} onClick={() => setRequestTab('params')}>
              {uiText('Params')}</TabBtn>
            <TabBtn id="http-request-tab-headers" panel="http-request-panel" active={requestTab === 'headers'} onClick={() => setRequestTab('headers')}>
              {uiText('Headers')}</TabBtn>
            <TabBtn
              id="http-request-tab-body"
              panel="http-request-panel"
              active={requestTab === 'body'}
              onClick={() => setRequestTab('body')}
              disabled={!methodAllowsBody(method)}
            >
              {uiText('Body')}</TabBtn>
            <span className="ml-auto hidden pr-2 text-[12px] text-mac-label-tertiary sm:inline">
              {runShortcut.binding && uiText('{value1} to send', { value1: formatShortcut(runShortcut.binding, runShortcut.platform) })}
            </span>
          </div>
          <div id="http-request-panel" role="tabpanel" aria-labelledby={`http-request-tab-${requestTab}`} tabIndex={0} className="min-h-0 flex-1 overflow-hidden p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-mac-accent">
            {requestTab === 'params' && (
              <div className="h-full overflow-hidden rounded-mac-lg border border-mac-separator bg-mac-surface">
                <KeyValueEditor
                  rows={query}
                  labelPrefix="Query"
                  onChange={setQuery}
                  keyPlaceholder="query"
                  valuePlaceholder="value"
                />
              </div>
            )}
            {requestTab === 'headers' && (
              <div className="h-full overflow-hidden rounded-mac-lg border border-mac-separator bg-mac-surface">
                <KeyValueEditor
                  rows={headers}
                  labelPrefix="Header"
                  onChange={setHeaders}
                  keyPlaceholder="Header"
                  valuePlaceholder="Value"
                />
              </div>
            )}
            {requestTab === 'body' && methodAllowsBody(method) && (
              <div className="flex h-full min-h-0 flex-col gap-2">
                <SegmentedControl label={uiText('Request body format')} className="!flex !flex-wrap" value={bodyMode} onChange={setBodyMode} options={BODY_MODES} />
                {bodyMode === 'form' && <p className="text-[12px] text-mac-label-secondary">{uiText('Multipart text fields; Content-Type boundary is generated automatically. File uploads are not available here.')}</p>}
                <div className="min-h-0 flex-1">
                  {bodyMode === 'none' && (
                    <div className="flex h-full items-center justify-center rounded-mac-lg border border-dashed border-mac-separator text-[14px] text-mac-label-tertiary">
                      {uiText('This request has no body')}</div>
                  )}
                  {(bodyMode === 'json' || bodyMode === 'text') && (
                    <CodeEditor
                      value={bodyText}
                      onChange={setBodyText}
                      language={bodyMode === 'json' ? 'json' : 'text'}
                      label={uiText('HTTP request body')}
                      readOnly={busy}
                      onRun={() => void send()}
                      placeholder={bodyMode === 'json' ? '{ }' : uiText('Raw body…')}
                    />
                  )}
                  {(bodyMode === 'form' || bodyMode === 'urlencoded') && (
                    <div className="h-full overflow-hidden rounded-mac-lg border border-mac-separator bg-mac-surface">
                      <KeyValueEditor
                        rows={formRows}
                        labelPrefix="Form field"
                        onChange={setFormRows}
                        keyPlaceholder="field"
                        valuePlaceholder="value"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </fieldset>

        <section className="flex min-h-[220px] min-w-0 flex-col">
          <div role="tablist" aria-label={uiText('HTTP response sections')} onKeyDown={navigateTabs} className="flex shrink-0 flex-wrap items-center gap-1 border-b border-mac-separator px-2">
            <TabBtn id="http-response-tab-body" panel="http-response-panel" active={responseTab === 'body'} onClick={() => setResponseTab('body')}>
              {uiText('Response')}</TabBtn>
            <TabBtn id="http-response-tab-headers" panel="http-response-panel" active={responseTab === 'headers'} onClick={() => setResponseTab('headers')}>
              {uiText('Headers')}</TabBtn>
            <TabBtn id="http-response-tab-code" panel="http-response-panel" active={responseTab === 'code'} onClick={() => setResponseTab('code')}>
              <Code2 className="mr-1 inline h-3 w-3" />
              {uiText('Code')}</TabBtn>
            {response && (
              <span
                className={cn(
                  'ml-2 rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums',
                  response.ok
                    ? 'bg-mac-success/15 text-mac-success'
                    : 'bg-mac-warning/15 text-mac-warning'
                )}
              >
                {response.status}
              </span>
            )}
            <div className="ml-auto flex items-center gap-2 pr-1">
              {responseTab === 'code' ? (
                <>
                  <select
                    aria-label={uiText('HTTP code language')}
                    className="mac-input !w-auto !py-1 text-[13px]"
                    value={snippetId}
                    onChange={(e) => setSnippetId(e.target.value as SnippetId)}
                  >
                    {SNIPPETS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <CopyButton text={validationError ? '' : snippet} label={uiText('Copy snippet')} />
                </>
              ) : (
                <>
                  <SaveToBoxButton
                    type={
                      responseTab === 'headers' || responseIsJson
                        ? 'json'
                        : 'text'
                    }
                    content={responseTab === 'headers' ? responseHeadersJson : prettyBody}
                    defaultName={
                      responseTab === 'headers' ? 'http-headers.json' : response?.bodyEncoding === 'base64' ? 'http-response.b64' : responseIsJson ? 'http-response.json' : 'http-response.txt'
                    }
                    disabled={!response}
                  />
                  <CopyButton
                    text={responseTab === 'headers' ? responseHeadersJson : prettyBody}
                    label={response?.bodyEncoding === 'base64' && responseTab === 'body' ? uiText('Copy Base64') : uiText('Copy')}
                  />
                </>
              )}
            </div>
          </div>
          {response && responseTab === 'body' && <div className="flex shrink-0 flex-wrap items-center gap-2 px-3 py-1 text-[12px] text-mac-label-secondary">
            {response.bodyEncoding === 'base64' ? <span>{uiText('Binary or non-UTF-8 response · displayed as Base64')}</span> : <label><input type="checkbox" disabled={!responseIsJson} checked={pretty} onChange={(e) => setPretty(e.target.checked)} /> {uiText('Format JSON layout')}</label>}
            {!response.bodyText && <span>{uiText('Empty response body (')}{method === 'HEAD' ? uiText('HEAD') : response.status})</span>}
          </div>}
          <div id="http-response-panel" role="tabpanel" aria-labelledby={`http-response-tab-${responseTab}`} tabIndex={0} className="min-h-0 flex-1 overflow-hidden p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-mac-accent">
            {responseTab === 'code' ? (
              <CodeEditor value={snippet} language="text" label={uiText('HTTP code snippet')} readOnly />
            ) : !response && !error ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 rounded-mac-lg border border-dashed border-mac-separator px-5 text-center text-[14px] text-mac-label-secondary">
                <Send className="mb-1 h-6 w-6 opacity-40" strokeWidth={1.5} />
                {busy ? uiText('Waiting for response…') : canceled ? uiText('Request canceled. Send again to retry.') : !available ? uiText('Desktop app required to send requests') : uiText('Send a request to see the response')}
                {!busy && !canceled && available && <p className="text-[13px]">{uiText('Set the URL, add any headers or query parameters, then press Send')}{runShortcut.binding ? ` ${uiText('or {value1}', { value1: formatShortcut(runShortcut.binding, runShortcut.platform) })}` : ''}.</p>}
              </div>
            ) : error && !response ? (
              <div className="flex h-full items-center justify-center rounded-mac-lg border border-mac-danger/30 bg-mac-danger/5 px-4 text-center text-[14px] text-mac-danger">
                {error}
              </div>
            ) : responseTab === 'headers' ? (
              <CodeEditor value={responseHeadersJson} language="json" label={uiText('HTTP response headers')} readOnly />
            ) : (
              <CodeEditor
                value={prettyBody}
                label={response?.bodyEncoding === 'base64' ? uiText('HTTP response Base64') : uiText('HTTP response body')}
                language={looksLikeJson(prettyBody) ? 'json' : 'text'}
                readOnly
              />
            )}
          </div>
        </section>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={statusTone}>{statusText}</ToolStatus>
        {response?.finalUrl && response.finalUrl !== payload.url && (
          <span className="ml-3 truncate font-mono text-[12px] text-mac-label-tertiary">
            → {response.finalUrl}
          </span>
        )}
      </footer>
    </div>
  )
}

function TabBtn({
  id,
  panel,
  active,
  onClick,
  disabled,
  children
}: {
  id: string
  panel: string
  active: boolean
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}): JSX.Element {
  useUiLocale()
  return (
    <button
      id={id}
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={panel}
      tabIndex={active ? 0 : -1}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'border-b-2 px-3 py-2.5 text-[14px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-mac-accent',
        active
          ? 'border-mac-accent text-mac-accent'
          : 'border-transparent text-mac-label-secondary hover:text-mac-label',
        disabled && 'cursor-not-allowed opacity-40'
      )}
    >
      {children}
    </button>
  )
}

function navigateTabs(event: React.KeyboardEvent<HTMLDivElement>): void {
  if (!(event.target instanceof HTMLButtonElement) || event.target.getAttribute('role') !== 'tab') return
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'))
  const index = tabs.indexOf(event.target)
  if (index < 0 || !tabs.length) return
  event.preventDefault()
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
  tabs[next]?.focus()
  tabs[next]?.click()
}

function methodColor(method: HttpMethod): string {
  switch (method) {
    case 'GET':
      return 'text-mac-success'
    case 'POST':
      return 'text-mac-warning'
    case 'PUT':
    case 'PATCH':
      return 'text-mac-accent'
    case 'DELETE':
      return 'text-mac-danger'
    default:
      return 'text-mac-label'
  }
}

function looksLikeJson(text: string): boolean {
  const t = text.trim()
  return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))
}
