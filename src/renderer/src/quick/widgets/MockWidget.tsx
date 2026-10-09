import { interfaceErrorMessage } from '@shared/i18n/error-message'
import { messageKey } from '@shared/i18n/message-key'
import { useEffect, useState } from 'react'
import { Copy, Play, Square } from 'lucide-react'
import type { WidgetApi } from '@shared/quick-tools'
import { MOCK_LIMITS, type MockStatus } from '@shared/mock-api/types'
import { QUICK_MOCK_YAML } from '@shared/mock-api/quick-example'

export default function MockWidget({ api, t }: { api: WidgetApi; t: (message: string) => string }): JSX.Element {
  const [status, setStatus] = useState<MockStatus | null>(null), [yaml, setYaml] = useState(QUICK_MOCK_YAML), [busy, setBusy] = useState(false), [notice, setNotice] = useState('')
  useEffect(() => {
    let alive = true
    const refresh = (): void => { void api.mock.status().then(value => { if (alive) setStatus(value) }).catch(error => { if (alive) setNotice(interfaceErrorMessage(error)) }) }
    void api.mock.config().then(value => { if (alive && value) setYaml(value) }).catch(() => {})
    refresh(); const timer = setInterval(refresh, 1500); return () => { alive = false; clearInterval(timer) }
  }, [api])
  const run = async (action: () => Promise<MockStatus>): Promise<void> => {
    if (busy) return
    setBusy(true); setNotice('')
    try { setStatus(await action()) } catch (error) { setNotice(interfaceErrorMessage(error)) }
    finally { setBusy(false) }
  }
  return <div className="quick-card">
    <div className="quick-server"><span className={'clip-led ' + (status?.running ? 'running' : '')} /><strong>{t(status?.running ? 'Running' : 'Stopped')}</strong><span>{status?.requests ?? 0} {t('requests')}</span></div>
    {status?.baseUrl && <button className="quick-value" onClick={() => void api.copyText(status.baseUrl!).then(() => setNotice(messageKey('Copied to clipboard.'))).catch(error => setNotice(interfaceErrorMessage(error)))}><code>{status.baseUrl}</code><Copy size={15} /></button>}
    <label>YAML<textarea spellCheck={false} aria-label={t('Mock API YAML')} rows={12} maxLength={MOCK_LIMITS.yamlBytes} readOnly={!!status?.running} value={yaml} onChange={e => setYaml(e.target.value)} /></label>
    <div className="quick-actions">{status?.running ? <button disabled={busy} onClick={() => void run(() => api.mock.stop())}><Square size={14} />{t('Stop server')}</button> : <button className="primary" disabled={busy || !status || !yaml} onClick={() => void run(() => api.mock.start(yaml))}><Play size={15} />{t('Start server')}</button>}</div>
    <p>{t('Runs on this computer. Start the server when you need it.')}</p>{status?.logs.slice(-3).reverse().map(log => <p className="quick-log" key={log.id}><code>{log.method} {log.endpoint}</code><span>{log.status} · {log.durationMs} ms</span></p>)}
    <p role="status" aria-live="polite">{t(notice)}</p>
  </div>
}
