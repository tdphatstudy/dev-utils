import { useMemo, useState } from 'react'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import { decodeJwt } from '@shared/crypto/jwt'

const SAMPLE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkRldlV0aWxzIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE5MTYyMzkwMjJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'

export default function JwtTool(): JSX.Element {
  const [token, setToken] = useState(SAMPLE)
  const result = useMemo(() => decodeJwt(token), [token])

  const headerText = result.ok ? JSON.stringify(result.header, null, 2) : ''
  const payloadText = result.ok ? JSON.stringify(result.payload, null, 2) : ''

  return (
    <div className="flex h-full flex-col">
      <ToolToolbar>
        <span className="text-[12px] text-mac-label-secondary">
          Decode only — signature is <strong className="text-mac-warning">not verified</strong>
        </span>
        <button type="button" className="mac-btn-ghost" onClick={() => setToken(SAMPLE)}>
          Sample
        </button>
        <div className="ml-auto flex gap-2">
          <CopyButton text={headerText} label="Copy header" />
          <CopyButton text={payloadText} label="Copy payload" />
        </div>
      </ToolToolbar>

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(100px,0.4fr)_1fr] gap-3 p-3">
        <CodeEditor value={token} onChange={setToken} language="text" placeholder="Paste JWT…" />
        <div className="grid min-h-0 grid-cols-2 gap-3">
          <div className="flex min-h-0 flex-col gap-1">
            <span className="px-1 text-[11px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
              Header
            </span>
            <CodeEditor value={headerText} language="json" readOnly />
          </div>
          <div className="flex min-h-0 flex-col gap-1">
            <span className="px-1 text-[11px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
              Payload
            </span>
            <CodeEditor value={payloadText} language="json" readOnly />
          </div>
        </div>
      </div>

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-mac-separator px-4 py-2 text-[12px]">
        {result.ok ? (
          <>
            <ToolStatus tone={result.expired ? 'warning' : 'success'}>
              {result.algorithm ?? 'alg?'}
              {result.expired ? ' · expired' : result.expiresAt ? ' · not expired' : ''}
            </ToolStatus>
            {result.issuedAt && (
              <span className="text-mac-label-secondary">iat {result.issuedAt}</span>
            )}
            {result.expiresAt && (
              <span className="text-mac-label-secondary">exp {result.expiresAt}</span>
            )}
          </>
        ) : (
          <ToolStatus tone="danger">{result.error}</ToolStatus>
        )}
      </footer>
    </div>
  )
}
