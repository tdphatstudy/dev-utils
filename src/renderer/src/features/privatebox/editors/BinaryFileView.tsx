import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { File, Download } from 'lucide-react'
import { formatBytes } from '@renderer/lib/utils'

interface Props {
  name: string
  /** base64 */
  value: string
  mimeType?: string
  onExport?: () => void
  className?: string
}

export function BinaryFileView({ name, value, mimeType, onExport, className }: Props): JSX.Element {
  useUiLocale()
  const bytes = value ? Math.floor((value.length * 3) / 4) : 0
  return (
    <div className={`flex h-full flex-col items-center justify-center gap-3 p-8 ${className ?? ''}`}>
      <div className="flex h-16 w-16 items-center justify-center rounded-mac-xl bg-mac-control text-mac-label-secondary">
        <File className="h-8 w-8" strokeWidth={1.5} />
      </div>
      <div className="text-center">
        <p className="text-[14px] font-semibold text-mac-label">{name}</p>
        <p className="mt-1 text-[12px] text-mac-label-secondary">
          {mimeType || uiText('application/octet-stream')} · {formatBytes(bytes)}
        </p>
        <p className="mt-2 max-w-sm text-[12px] text-mac-label-tertiary">{uiText('Binary file stored encrypted in the vault. Preview is not available — export to open with another app.')}{' '}</p>
      </div>
      {onExport && (
        <button type="button" className="mac-btn-primary mt-2" onClick={onExport}>
          <Download className="h-3.5 w-3.5" />{uiText('Export to disk…')}{' '}</button>
      )}
    </div>
  )
}
