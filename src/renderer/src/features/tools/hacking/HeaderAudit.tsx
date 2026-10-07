import type { HeaderReport } from '@shared/security-testing/types'
import { Findings, NetworkActions, useNetworkJob, Workbench } from './Workbench'
import { RequestComposer, useRequest } from './RequestComposer'

export default function HeaderAudit(): JSX.Element {
  const request = useRequest(), job = useNetworkJob<HeaderReport>()
  return <Workbench purpose="Check security headers returned by your endpoint." limits="One explicit GET or HEAD, no redirects, normal TLS validation. Timeout ≤30 seconds; response reading capped at 256 KiB. Reports include checks and header names, without raw response header values." busy={job.busy} hasResult={Boolean(job.result)} error={job.error} network={true}
    toolbar={<NetworkActions job={job} action="Check security headers" start={() => void job.run(id => window.devutils.securityTesting.headers({ request: request.payload() }, id))} />}
    input={<>
    <fieldset disabled={job.busy} onChange={job.clear}><RequestComposer request={request} probe onEdit={job.clear} /></fieldset>
    </>}>
    {job.result && <Findings title="Security header findings" summary={`HTTP ${job.result.status} · ${job.result.observed.length} header names observed`} findings={job.result.findings} />}
  </Workbench>
}
