import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useEffect, useRef, type ReactNode } from 'react'
import { Upload } from 'lucide-react'
import { MAX_ANALYSIS_CHARS } from '@shared/enterprise/common'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { ToolWorkspace, type ToolWorkspaceProps } from '@renderer/components/ui/ToolWorkspace'

export function AnalysisShell(props: ToolWorkspaceProps): JSX.Element {
  return <ToolWorkspace {...props} />
}

export function AnalysisInput({ label, value, revision, onChange, onError, accept = '.json,application/json', placeholder }: { label: string; value: string; revision: number; onChange: (value: string) => void; onError: (message: string | null) => void; accept?: string; placeholder: string }): JSX.Element {
  useUiLocale()
  const generation = useRef(0)
  const previousRevision = useRef(revision)
  if (previousRevision.current !== revision) { previousRevision.current = revision; generation.current++ }
  useEffect(() => { generation.current++ }, [value])
  useEffect(() => () => { generation.current++ }, [])
  return <div className="flex h-full min-h-0 min-w-0 flex-col gap-2"><div className="flex shrink-0 justify-end">
    <label className="mac-btn-secondary cursor-pointer !text-[12px] focus-within:ring-2 focus-within:ring-mac-accent"><Upload aria-hidden="true" className="h-3.5 w-3.5" />{uiText('Open local file')}<input aria-label={`Open ${uiText(label)} file`} type="file" accept={accept} className="sr-only" onChange={async event => {
      const file = event.target.files?.[0]; event.target.value = ''
      if (!file) return
      const revision = ++generation.current
      if (file.size > MAX_ANALYSIS_CHARS * 4) { onError('File exceeds 8 MiB. Split it into smaller documents.'); return }
      try {
        const bytes = await file.arrayBuffer()
        if (revision !== generation.current) return
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '')
        if (text.length > MAX_ANALYSIS_CHARS) throw new Error('Input exceeds 2 Mi characters.')
        onChange(text); onError(null)
      } catch { if (revision === generation.current) onError('Unable to read a bounded UTF-8 file. Convert its encoding or reduce its size.') }
    }} /></label></div>
    <div className="min-h-0 min-w-0 flex-1"><CodeEditor label={label} value={value} language={accept.includes('yaml') ? 'yaml' : accept.includes('jsonl') ? 'text' : 'json'} issue={null} maxLength={MAX_ANALYSIS_CHARS} onChange={next => { if (next.length <= MAX_ANALYSIS_CHARS) onChange(next); else onError('Input exceeds 2 Mi characters.') }} placeholder={placeholder} /></div>
  </div>
}

export function AnalysisToolbar({ action, busy, run, cancel, example, clear, report }: { action: string; busy: boolean; run: () => void; cancel: () => void; example: () => void; clear: () => void; report?: string }): JSX.Element {
  useUiLocale()
  return <div className="flex flex-wrap items-center gap-2"><button type="button" className="mac-btn-primary" disabled={busy} onClick={run}>{busy ? uiText('Working…') : uiText(action)}</button>{busy && <button type="button" className="mac-btn-secondary" onClick={cancel}>{uiText('Cancel analysis')}</button>}<button type="button" className="mac-btn-secondary" onClick={example}>{uiText('Load example')}</button><button type="button" className="mac-btn-ghost" onClick={clear}>{uiText('Clear inputs')}</button>{report && <CopyButton text={report} label={uiText('Copy report')} />}</div>
}

export function AnalysisError({ message }: { message: string | null }): JSX.Element | null {
  useUiLocale()
  return message ? <p role="alert" className="rounded-mac-lg border border-mac-danger/40 bg-mac-danger/10 p-3 text-[13px] text-mac-danger">{message}</p> : null
}

export function AnalysisResults({ title, summary, children }: { title: string; summary: string; children: ReactNode }): JSX.Element {
  useUiLocale()
  return <section aria-label={uiText(title)} className="min-w-0 space-y-3 rounded-mac-lg border border-mac-separator bg-mac-surface p-4"><h2 className="text-[14px] font-semibold">{uiText(title)}</h2><p role="status" className="text-[13px] leading-relaxed text-mac-label-secondary">{uiText(summary)}</p>{children}</section>
}

export function AnalysisTable({ headers, rows, caption }: { headers: string[]; rows: ReactNode[][]; caption: string }): JSX.Element {
  useUiLocale()
  return <div className="max-h-[440px] overflow-auto rounded-mac-lg border border-mac-separator"><table style={{ minWidth: headers.length >= 5 ? 620 : undefined }} className="w-full table-fixed text-left text-[12px]"><caption className="sr-only">{uiText(caption)}</caption><thead className="sticky top-0 bg-mac-toolbar"><tr className="border-b border-mac-separator">{headers.map(header => <th scope="col" className="break-words px-3 py-2.5 font-medium text-mac-label-secondary" key={header}>{uiText(header)}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index} className="border-b border-mac-separator transition-colors hover:bg-mac-accent-soft/30 last:border-0">{row.map((cell, column) => <td key={column} className="selectable break-words px-3 py-2.5 align-top [overflow-wrap:anywhere]">{cell}</td>)}</tr>)}</tbody></table>{!rows.length && <p className="p-4 text-center text-[13px] text-mac-label-secondary">{uiText('No findings')}</p>}</div>
}
