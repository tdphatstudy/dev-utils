import { useEffect, useMemo, useState } from 'react'
import { Download, Film, Image as ImageIcon, Music } from 'lucide-react'
import { cn, formatBytes } from '@renderer/lib/utils'
import { mimeFromFileName, type ContentKindId } from '@shared/secret-box/content-kinds'
import { useI18n } from '@renderer/i18n'

interface Props {
  /** base64 payload (no data: prefix) */
  value: string
  name: string
  type: ContentKindId
  mimeType?: string
  className?: string
  onExport?: () => void
}

export function MediaViewer({
  value,
  name,
  type,
  mimeType,
  className,
  onExport
}: Props): JSX.Element {
  const { t } = useI18n()
  const mime = mimeType || mimeFromFileName(name, type)
  const [error, setError] = useState<string | null>(null)

  const blobUrl = useMemo(() => {
    try {
      if (!value) return null
      const bin = atob(value)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const blob = new Blob([bytes], { type: mime })
      return URL.createObjectURL(blob)
    } catch {
      return null
    }
  }, [value, mime])

  useEffect(() => {
    setError(null)
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [blobUrl])

  const approxBytes = value ? Math.floor((value.length * 3) / 4) : 0

  if (!blobUrl) {
    return (
      <div className={cn('flex h-full flex-col items-center justify-center gap-2 p-6', className)}>
        <p role="alert" className="text-[13px] text-mac-danger">{t('Could not decode media payload')}</p>
      </div>
    )
  }

  return (
    <div className={cn('flex h-full min-h-0 flex-col bg-mac-bg', className)}>
      <div className="flex shrink-0 items-center gap-2 border-b border-mac-separator px-3 py-2 text-[12px] text-mac-label-secondary">
        {type === 'image' && <ImageIcon className="h-3.5 w-3.5" />}
        {type === 'video' && <Film className="h-3.5 w-3.5" />}
        {type === 'audio' && <Music className="h-3.5 w-3.5" />}
        <span className="min-w-0 truncate font-mono text-[11px]">{mime}</span>
        <span className="text-mac-label-tertiary">· {formatBytes(approxBytes)}</span>
        <span className="text-mac-label-tertiary">· {t('Encrypted in vault')}</span>
        {onExport && (
          <button type="button" className="mac-btn-secondary ml-auto !py-1 text-[12px]" onClick={onExport}>
            <Download className="h-3.5 w-3.5" />
            {t('Export…')}
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
        {type === 'image' && (
          <img
            src={blobUrl}
            alt={name}
            className="max-h-full max-w-full rounded-mac object-contain shadow-mac"
            onError={() => setError('Browser could not display this image')}
          />
        )}
        {type === 'video' && (
          <video
            src={blobUrl}
            controls
            className="max-h-full max-w-full rounded-mac bg-black shadow-mac"
            onError={() => setError('Browser could not play this video')}
          />
        )}
        {type === 'audio' && (
          <div className="flex w-full max-w-lg flex-col items-center gap-4">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-mac-accent-soft text-mac-accent">
              <Music className="h-10 w-10" strokeWidth={1.5} />
            </div>
            <p className="text-[13px] font-medium text-mac-label">{name}</p>
            <audio
              src={blobUrl}
              controls
              className="w-full"
              onError={() => setError('Browser could not play this audio')}
            />
          </div>
        )}
        {error && <p role="alert" className="mt-3 text-[12px] text-mac-danger">{t(error)}</p>}
      </div>
    </div>
  )
}
