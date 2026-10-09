import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useState } from 'react'
import type { BodyMode, HttpMethod, HttpRequestModel, HttpRequestPayload } from '@shared/http/types'
import { buildHttpPayload, methodAllowsBody, newRow } from '@shared/http/build-request'
import { KeyValueEditor } from '@renderer/components/ui/KeyValueEditor'
import { Field } from './Workbench'
import { ToolTextInput } from '@renderer/components/ui/ToolTextInput'

export function useRequest(): { model: HttpRequestModel; setModel: (model: HttpRequestModel) => void; timeout: number; setTimeout: (value: number) => void; payload: () => HttpRequestPayload } {
  const [model, setModel] = useState<HttpRequestModel>({ method: 'GET', url: 'http://127.0.0.1:3000', query: [newRow()], headers: [newRow()], bodyMode: 'none', bodyText: '', formRows: [newRow()] })
  const [timeout, setTimeout] = useState(10000)
  return { model, setModel, timeout, setTimeout, payload: () => ({ ...buildHttpPayload(model), timeoutMs: timeout }) }
}

export function RequestComposer({ request, probe = false, disabled = false, onEdit }: { request: ReturnType<typeof useRequest>; probe?: boolean; disabled?: boolean; onEdit?: () => void }): JSX.Element {
  useUiLocale()
  const { model, setModel } = request
  const patch = (value: Partial<HttpRequestModel>): void => { setModel({ ...model, ...value }); onEdit?.() }
  return <div className="space-y-3">
    <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3"><Field label={uiText('HTTP method')}><select className="mac-input" value={model.method} onChange={event => patch({ method: event.target.value as HttpMethod })}>{(probe ? ['GET', 'HEAD'] : ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']).map(method => <option key={method}>{method}</option>)}</select></Field>
      <Field label={uiText('Target URL')}><input className="mac-input font-mono" value={model.url} maxLength={8192} onChange={event => patch({ url: event.target.value })} type="url" autoComplete="off" spellCheck={false} /></Field>
      </div>
    <div className="space-y-2">{(['query', 'headers'] as const).map(key => <details key={key} className="min-w-0 rounded-mac-lg border border-mac-separator bg-mac-control/30"><summary className="cursor-pointer px-3 py-2.5 text-[13px] font-medium">{uiText(key === 'query' ? 'Query parameters' : 'Request headers')}<span className="ms-2 text-[11px] text-mac-label-secondary">{model[key].filter(row => row.enabled && row.key.trim()).length}</span></summary><div className="h-44 border-t border-mac-separator"><KeyValueEditor labelPrefix={key === 'query' ? 'Parameter' : 'Header'} rows={model[key]} onChange={rows => patch({ [key]: rows })} /></div></details>)}</div>
    <Field label={uiText('Timeout (ms)')}><input className="mac-input max-w-[180px]" type="number" min={100} max={30000} value={request.timeout} onChange={event => { request.setTimeout(Number(event.target.value)); onEdit?.() }} /></Field>
    {!probe && methodAllowsBody(model.method) && <div className="space-y-2"><Field label={uiText('Request body')}><select className="mac-input max-w-xs" value={model.bodyMode} onChange={event => patch({ bodyMode: event.target.value as BodyMode })}>{Object.entries({ none: 'No body', json: 'JSON', text: 'Plain text', urlencoded: 'URL-encoded form', form: 'Multipart form' }).map(([mode, label]) => <option key={mode} value={mode}>{uiText(label)}</option>)}</select></Field>
      {(model.bodyMode === 'json' || model.bodyMode === 'text') && <ToolTextInput label={uiText('Body content')} value={model.bodyText} maxLength={65536} disabled={disabled} language={model.bodyMode === 'json' ? 'json' : 'text'} onChange={bodyText => patch({ bodyText })} />}
      {(model.bodyMode === 'urlencoded' || model.bodyMode === 'form') && <div className="h-44 rounded-mac-lg border border-mac-separator"><KeyValueEditor labelPrefix="Body field" rows={model.formRows} onChange={rows => patch({ formRows: rows })} /></div>}</div>}
  </div>
}
