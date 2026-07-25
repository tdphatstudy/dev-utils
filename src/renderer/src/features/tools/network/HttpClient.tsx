import { useState } from 'react'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD'

export default function HttpClient(): JSX.Element {
  const [method, setMethod] = useState<Method>('GET')
  const [url, setUrl] = useState('https://httpbin.org/get')
  const [headers, setHeaders] = useState('{\n  "Accept": "application/json"\n}')
  const [body, setBody] = useState('')
  const [response, setResponse] = useState('')
  const [meta, setMeta] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    setResponse('')
    setMeta('')
    const started = performance.now()
    try {
      let parsedHeaders: Record<string, string> = {}
      if (headers.trim()) {
        const h = JSON.parse(headers) as unknown
        if (h && typeof h === 'object' && !Array.isArray(h)) {
          parsedHeaders = h as Record<string, string>
        } else {
          throw new Error('Headers must be a JSON object')
        }
      }

      const init: RequestInit = {
        method,
        headers: parsedHeaders
      }
      if (method !== 'GET' && method !== 'HEAD' && body) {
        init.body = body
      }

      const res = await fetch(url, init)
      const elapsed = Math.round(performance.now() - started)
      const text = await res.text()
      const headerObj: Record<string, string> = {}
      res.headers.forEach((v, k) => {
        headerObj[k] = v
      })

      setMeta(
        JSON.stringify(
          {
            status: res.status,
            statusText: res.statusText,
            ok: res.ok,
            timeMs: elapsed,
            headers: headerObj
          },
          null,
          2
        )
      )

      try {
        setResponse(JSON.stringify(JSON.parse(text), null, 2))
      } catch {
        setResponse(text)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ToolToolbar>
        <select
          className="mac-input !w-auto !py-1 font-mono"
          value={method}
          onChange={(e) => setMethod(e.target.value as Method)}
        >
          {(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'] as Method[]).map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input
          className="mac-input min-w-0 flex-1 font-mono"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          spellCheck={false}
        />
        <button type="button" className="mac-btn-primary" disabled={busy || !url} onClick={send}>
          {busy ? 'Sending…' : 'Send'}
        </button>
        <CopyButton text={response} label="Copy body" />
      </ToolToolbar>

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 p-3">
        <div className="grid min-h-0 grid-rows-2 gap-3">
          <div className="flex min-h-0 flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
              Headers (JSON)
            </span>
            <CodeEditor value={headers} onChange={setHeaders} language="json" />
          </div>
          <div className="flex min-h-0 flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
              Body
            </span>
            <CodeEditor
              value={body}
              onChange={setBody}
              language="text"
              placeholder={method === 'GET' || method === 'HEAD' ? 'N/A for GET/HEAD' : 'Request body…'}
            />
          </div>
        </div>
        <div className="grid min-h-0 grid-rows-2 gap-3">
          <div className="flex min-h-0 flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
              Response meta
            </span>
            <CodeEditor value={meta} language="json" readOnly />
          </div>
          <div className="flex min-h-0 flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
              Response body
            </span>
            <CodeEditor value={response} language="text" readOnly />
          </div>
        </div>
      </div>

      <footer className="border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={error ? 'danger' : meta ? 'success' : 'warning'}>
          {error ??
            (meta
              ? 'User-initiated request · response stays in memory'
              : 'Only sends when you click Send · no background network')}
        </ToolStatus>
      </footer>
    </div>
  )
}
