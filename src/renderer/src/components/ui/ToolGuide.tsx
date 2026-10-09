import { ShieldCheck, Wifi, LockKeyhole } from 'lucide-react'
import type { ToolDefinition } from '@renderer/registry/tools'
import { useI18n } from '@renderer/i18n'

const NETWORK_TOOLS = new Set(['network.http', 'network.mock-api', 'network.local-domains', 'network.dns', 'network.ssh', 'network.ports', 'hacking.stress', 'hacking.headers', 'hacking.cors'])
export function ToolGuide({ tool }: { tool: ToolDefinition }): JSX.Element {
  const { t } = useI18n()
  const network = NETWORK_TOOLS.has(tool.id), protectedStore = tool.group === 'privatebox'
  const input = protectedStore ? 'Unlock or create your encrypted box before reading or saving documents. Keep your recovery material safe.'
    : network ? 'Enter an authorized target and review request options. Network access starts only when you run an action.'
    : tool.id.includes('diff') || ['json.reconcile', 'security.env', 'network.openapi'].includes(tool.id) ? 'Use separate inputs for the original and target data. Keep their order consistent.'
    : tool.group === 'time' ? 'Check the units, time zone and format. Unix seconds and milliseconds produce different dates.'
    : tool.group === 'file' || ['convert.image', 'convert.fileext', 'text.ocr', 'base64.image'].includes(tool.id) ? 'Open a local file and choose the output settings. Files are processed on your device.'
    : 'Paste the data to process, or load a sample.'
  const Icon = protectedStore ? LockKeyhole : network ? Wifi : ShieldCheck
  return <section id={`tool-guide-${tool.id}`} aria-label={t('Quick guide')} className="max-h-[38%] shrink-0 overflow-auto border-b border-mac-separator bg-mac-surface px-4 py-3 sm:px-5" data-tool-guide>
    <p className="mb-3 flex items-center gap-2 text-[12px] font-medium text-mac-label-secondary"><Icon className="h-4 w-4" aria-hidden />{t(protectedStore ? 'Protected storage' : network ? 'Network on action' : 'Local processing')}</p>
    <ol className="grid gap-3 lg:grid-cols-3">{[
      [t('Prepare the input'), input],
      [t('Choose an action'), t('Choose the mode and options, then use the main action. Some tools update as you type.')],
      [t('Review the result'), t('Check Output and status messages. Copy or export only when the result is ready.')]
    ].map(([title, detail], index) => <li key={title} className="flex min-w-0 items-start gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mac-accent-soft text-[11px] font-semibold text-mac-accent">{index + 1}</span><div><h2 className="text-[13px] font-semibold">{t(title)}</h2><p className="mt-1 text-[12px] leading-relaxed text-mac-label-secondary">{t(detail)}</p></div></li>)}</ol>
  </section>
}
