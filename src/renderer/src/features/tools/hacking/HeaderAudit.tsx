import type { HeaderReport } from '@shared/security-testing/types'
import { useState } from 'react'
import { t, useI18n } from '@renderer/i18n'
import { reviewHeaders } from '@shared/security-testing/review'
import { parseResponseHeaders } from '@shared/security-testing/header-input'
import { ToolTextInput } from '@renderer/components/ui/ToolTextInput'
import { Field, Findings, NetworkActions, useNetworkJob, Workbench } from './Workbench'
import { RequestComposer, useRequest } from './RequestComposer'

export default function HeaderAudit(): JSX.Element {
  useI18n()
  const request = useRequest(), job = useNetworkJob<HeaderReport>()
  const [source, setSource] = useState('endpoint'), [text, setText] = useState(''), [https, setHttps] = useState(true), [localResult, setLocalResult] = useState<HeaderReport | null>(null), [localError, setLocalError] = useState<string | null>(null)
  const clear = (): void => { job.clear(); setLocalResult(null); setLocalError(null) }
  const result = source === 'endpoint' ? job.result : localResult
  return <Workbench purpose="Check security headers returned by your endpoint." limits="One explicit GET or HEAD, no redirects, normal TLS validation. Timeout ≤30 seconds; response reading capped at 256 KiB. Reports include checks and header names, without raw response header values." busy={job.busy} hasResult={Boolean(result)} error={source === 'endpoint' ? job.error : localError} network={source === 'endpoint'}
    toolbar={source === 'endpoint' ? <NetworkActions job={job} action="Check security headers" start={() => void job.run(id => window.devutils.securityTesting.headers({ request: request.payload() }, id))} /> : <button type="button" className="mac-btn-primary" onClick={() => { clear(); try { setLocalResult(reviewHeaders(parseResponseHeaders(text), https)) } catch (error) { setLocalError(error instanceof Error ? error.message : 'Invalid response headers.') } }}>{t('Check security headers')}</button>}
    input={<>
    <fieldset disabled={job.busy} className="space-y-3" onChange={clear}>
      <Field label="Header source"><select className="mac-input" value={source} onChange={event => { clear(); setSource(event.target.value) }}><option value="endpoint">{t('Live endpoint')}</option><option value="paste">{t('Paste response headers')}</option></select></Field>
      {source === 'endpoint' ? <RequestComposer request={request} probe onEdit={clear} /> : <><ToolTextInput label="Response headers" value={text} maxLength={65536} onChange={value => { clear(); setText(value) }} /><label className="flex items-center gap-2 text-[12px]"><input type="checkbox" checked={https} onChange={event => setHttps(event.target.checked)} />{t('Response was served over HTTPS')}</label><p className="text-[12px] text-mac-label-secondary">{t('Paste Name: value lines from your browser or proxy. This mode sends no requests.')}</p></>}
    </fieldset>
    </>}>
    {result && <Findings title="Security header findings" summary={source === 'endpoint' ? `HTTP ${result.status} · ${result.observed.length} header names observed` : t('Offline header review')} findings={result.findings} />}
  </Workbench>
}
