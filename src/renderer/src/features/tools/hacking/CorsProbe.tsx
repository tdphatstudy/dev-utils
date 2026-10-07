import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useState } from 'react'
import type { CorsReport } from '@shared/security-testing/types'
import { Field, Findings, NetworkActions, useNetworkJob, Workbench } from './Workbench'

export default function CorsProbe(): JSX.Element {
  useUiLocale()
  const job = useNetworkJob<CorsReport>(), [url, setUrl] = useState('http://127.0.0.1:3000'), [origin, setOrigin] = useState('https://security-test.example'), [method, setMethod] = useState('GET'), [headers, setHeaders] = useState(''), [credentials, setCredentials] = useState(false)
  return <Workbench purpose="Check CORS with OPTIONS and GET. No credentials are sent." limits="Two explicit requests, each ≤10 seconds and 256 KiB. No cookies, authorization values or redirects are sent. Credential mode is an analysis setting only; use a browser integration test to confirm actual access." busy={job.busy} hasResult={Boolean(job.result)} error={job.error} network={true}
    toolbar={<NetworkActions job={job} action="Probe CORS policy" start={() => void job.run(id => window.devutils.securityTesting.cors({ url, origin, method, headers: headers.split(',').map(value => value.trim()).filter(Boolean), credentials }, id))} />}
    input={<>
    <fieldset disabled={job.busy} className="space-y-3" onChange={job.clear}>
      <div className="flex flex-wrap gap-2" role="group" aria-label={uiText('Origin presets')}>{[['Untrusted origin', 'https://security-test.example', false], ['Null origin', 'null', false], ['Credentialed origin', 'https://security-test.example', true]].map(([label, value, credentialed]) => <button type="button" key={String(label)} className="mac-btn-secondary" onClick={() => { job.clear(); setOrigin(String(value)); setCredentials(Boolean(credentialed)) }}>{uiText(String(label))}</button>)}</div>
      <Field label={uiText('Target URL')}><input className="mac-input font-mono" value={url} maxLength={8192} onChange={event => setUrl(event.target.value)} autoComplete="off" spellCheck={false} /></Field>
      <Field label="Test origin"><input className="mac-input font-mono" value={origin} maxLength={2048} onChange={event => setOrigin(event.target.value)} autoComplete="off" spellCheck={false} /></Field>
      <div className="grid gap-3 sm:grid-cols-[140px_1fr]"><Field label="Preflight method"><select className="mac-input" value={method} onChange={event => setMethod(event.target.value)}>{['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].map(item => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Requested header names (comma separated)"><input className="mac-input font-mono" value={headers} maxLength={2580} onChange={event => setHeaders(event.target.value)} placeholder="authorization, content-type" spellCheck={false} /></Field></div>
      <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={credentials} onChange={event => setCredentials(event.target.checked)} />{uiText('Analyze credentialed browser access (does not send credentials)')}</label>
    </fieldset>
    </>}>
    {job.result && <Findings title="CORS findings" summary={`OPTIONS ${job.result.preflightStatus} · GET ${job.result.sampleStatus} · Policy observations for one origin, without a browser exploit test`} findings={job.result.findings} />}
  </Workbench>
}
