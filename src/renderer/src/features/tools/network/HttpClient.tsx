import { useMemo, useState } from 'react'
import { Send, Code2 } from 'lucide-react'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { KeyValueEditor } from '@renderer/components/ui/KeyValueEditor'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import { buildHttpPayload, methodAllowsBody, newRow } from '@shared/http/build-request'
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

type RequestTab = 'params' | 'headers' | 'body'
type ResponseTab = 'body' | 'headers' | 'code'
type StatusTone = 'neutral' | 'success' | 'danger' | 'warning'

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

const BODY_MODES: { value: BodyMode; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'json', label: 'JSON' },
  { value: 'text', label: 'Raw' },
  { value: 'urlencoded', label: 'x-www-form-urlencoded' },
  { value: 'form', label: 'Form data' }
]

export default function HttpClient(): JSX.Element {
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

  const payload = useMemo(() => buildHttpPayload(model), [model])
  const snippet = useMemo(() => generateSnippet(snippetId, payload), [snippetId, payload])

  const prettyBody = useMemo(() => {
    if (!response?.bodyText) return ''
    try {
      return JSON.stringify(JSON.parse(response.bodyText), null, 2)
    } catch {
      return response.bodyText
    }
  }, [response])

  const responseHeadersJson = useMemo(
    () => (response ? JSON.stringify(response.headers, null, 2) : ''),
    [response]
  )

  const send = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    setResponse(null)
    try {
      if (!window.devutils?.net?.httpRequest) {
        throw new Error('HTTP bridge unavailable — restart the app')
      }
      const res = await window.devutils.net.httpRequest(payload)
      setResponse(res)
      setResponseTab('body')
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : typeof e === 'object' && e && 'message' in e
            ? String((e as { message: unknown }).message)
            : 'Request failed'
      setError(message)
    } finally {
      setBusy(false)
    }
  }

  const onMethodChange = (m: HttpMethod): void => {
    setMethod(m)
    if (!methodAllowsBody(m)) {
      setBodyMode('none')
    } else if (bodyMode === 'none' && (m === 'POST' || m === 'PUT' || m === 'PATCH')) {
      setBodyMode('json')
      setRequestTab('body')
    }
  }

  const statusTone: StatusTone = error
    ? 'danger'
    : response
      ? response.ok
        ? 'success'
        : 'warning'
      : 'neutral'

  const statusText = error
    ? error
    : busy
      ? 'Sending…'
      : response
        ? `${response.status} ${response.statusText} · ${response.timeMs}ms · ${formatBytes(response.size)}`
        : 'Requests run in the main process (no CORS) · user-initiated only'

  return (
    <div className="flex h-full flex-col">
      <ToolToolbar className="!flex-nowrap gap-2">
        <select
          className={cn(
            'mac-input !w-[110px] shrink-0 !py-1.5 font-mono text-[12px] font-semibold',
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
          className="mac-input min-w-0 flex-1 font-mono text-[13px]"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://api.example.com/v1/…"
          spellCheck={false}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send()
          }}
        />
        <button
          type="button"
          className="mac-btn-primary shrink-0 !px-4"
          disabled={busy || !url.trim()}
          onClick={() => void send()}
        >
          <Send className="h-3.5 w-3.5" />
          {busy ? 'Sending…' : 'Send'}
        </button>
      </ToolToolbar>

      <div className="grid min-h-0 flex-1 grid-rows-2 divide-y divide-mac-separator">
        <section className="flex min-h-0 flex-col">
          <div className="flex shrink-0 items-center gap-1 border-b border-mac-separator px-2">
            <TabBtn active={requestTab === 'params'} onClick={() => setRequestTab('params')}>
              Params
            </TabBtn>
            <TabBtn active={requestTab === 'headers'} onClick={() => setRequestTab('headers')}>
              Headers
            </TabBtn>
            <TabBtn
              active={requestTab === 'body'}
              onClick={() => setRequestTab('body')}
              disabled={!methodAllowsBody(method)}
            >
              Body
            </TabBtn>
            <span className="ml-auto pr-2 text-[11px] text-mac-label-tertiary">
              ⌘/Ctrl+Enter to send
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden p-2">
            {requestTab === 'params' && (
              <div className="h-full overflow-hidden rounded-mac-lg border border-mac-separator bg-mac-surface">
                <KeyValueEditor
                  rows={query}
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
                  onChange={setHeaders}
                  keyPlaceholder="Header"
                  valuePlaceholder="Value"
                />
              </div>
            )}
            {requestTab === 'body' && methodAllowsBody(method) && (
              <div className="flex h-full min-h-0 flex-col gap-2">
                <div className="flex flex-wrap gap-1">
                  {BODY_MODES.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      className={cn(
                        'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                        bodyMode === m.value
                          ? 'bg-mac-accent text-white'
                          : 'bg-mac-control text-mac-label-secondary hover:bg-mac-control-hover'
                      )}
                      onClick={() => setBodyMode(m.value)}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <div className="min-h-0 flex-1">
                  {bodyMode === 'none' && (
                    <div className="flex h-full items-center justify-center rounded-mac-lg border border-dashed border-mac-separator text-[13px] text-mac-label-tertiary">
                      This request has no body
                    </div>
                  )}
                  {(bodyMode === 'json' || bodyMode === 'text') && (
                    <CodeEditor
                      value={bodyText}
                      onChange={setBodyText}
                      language={bodyMode === 'json' ? 'json' : 'text'}
                      placeholder={bodyMode === 'json' ? '{ }' : 'Raw body…'}
                    />
                  )}
                  {(bodyMode === 'form' || bodyMode === 'urlencoded') && (
                    <div className="h-full overflow-hidden rounded-mac-lg border border-mac-separator bg-mac-surface">
                      <KeyValueEditor
                        rows={formRows}
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
        </section>

        <section className="flex min-h-0 flex-col">
          <div className="flex shrink-0 items-center gap-1 border-b border-mac-separator px-2">
            <TabBtn active={responseTab === 'body'} onClick={() => setResponseTab('body')}>
              Response
            </TabBtn>
            <TabBtn active={responseTab === 'headers'} onClick={() => setResponseTab('headers')}>
              Headers
            </TabBtn>
            <TabBtn active={responseTab === 'code'} onClick={() => setResponseTab('code')}>
              <Code2 className="mr-1 inline h-3 w-3" />
              Code
            </TabBtn>
            {response && (
              <span
                className={cn(
                  'ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums',
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
                    className="mac-input !w-auto !py-1 text-[12px]"
                    value={snippetId}
                    onChange={(e) => setSnippetId(e.target.value as SnippetId)}
                  >
                    {SNIPPETS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <CopyButton text={snippet} label="Copy snippet" />
                </>
              ) : (
                <>
                  <SaveToBoxButton
                    type={
                      responseTab === 'headers' || prettyBody.trimStart().startsWith('{')
                        ? 'json'
                        : 'text'
                    }
                    content={responseTab === 'headers' ? responseHeadersJson : prettyBody}
                    defaultName={
                      responseTab === 'headers' ? 'http-headers.json' : 'http-response.txt'
                    }
                    disabled={!response}
                  />
                  <CopyButton
                    text={responseTab === 'headers' ? responseHeadersJson : prettyBody}
                    label="Copy"
                  />
                </>
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden p-2">
            {responseTab === 'code' ? (
              <CodeEditor value={snippet} language="text" readOnly />
            ) : !response && !error ? (
              <div className="flex h-full flex-col items-center justify-center gap-1 rounded-mac-lg border border-dashed border-mac-separator text-[13px] text-mac-label-tertiary">
                <Send className="mb-1 h-6 w-6 opacity-40" strokeWidth={1.5} />
                Send a request to see the response
              </div>
            ) : error && !response ? (
              <div className="flex h-full items-center justify-center rounded-mac-lg border border-mac-danger/30 bg-mac-danger/5 px-4 text-center text-[13px] text-mac-danger">
                {error}
              </div>
            ) : responseTab === 'headers' ? (
              <CodeEditor value={responseHeadersJson} language="json" readOnly />
            ) : (
              <CodeEditor
                value={prettyBody}
                language={looksLikeJson(prettyBody) ? 'json' : 'text'}
                readOnly
              />
            )}
          </div>
        </section>
      </div>

      <footer className="flex items-center border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={statusTone}>{statusText}</ToolStatus>
        {response?.finalUrl && response.finalUrl !== payload.url && (
          <span className="ml-3 truncate font-mono text-[11px] text-mac-label-tertiary">
            → {response.finalUrl}
          </span>
        )}
      </footer>
    </div>
  )
}

function TabBtn({
  active,
  onClick,
  disabled,
  children
}: {
  active: boolean
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}): JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'border-b-2 px-3 py-2 text-[12px] font-medium transition-colors',
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
