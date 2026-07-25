import { useMemo } from 'react'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { convertLineEndings, detectLineEnding, countLines } from '@shared/file/text'
import { cn } from '@renderer/lib/utils'

interface Props {
  value: string
  onChange: (value: string) => void
  className?: string
}

export function TextFileEditor({ value, onChange, className }: Props): JSX.Element {
  const lines = useMemo(() => countLines(value), [value])
  const ending = useMemo(() => detectLineEnding(value), [value])
  const chars = value.length
  const words = useMemo(
    () => (value.trim() ? value.trim().split(/\s+/).length : 0),
    [value]
  )

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-mac-separator px-2 py-1.5">
        <button
          type="button"
          className="mac-btn-secondary !text-[11px]"
          onClick={() => onChange(convertLineEndings(value, 'lf'))}
        >
          → LF
        </button>
        <button
          type="button"
          className="mac-btn-secondary !text-[11px]"
          onClick={() => onChange(convertLineEndings(value, 'crlf'))}
        >
          → CRLF
        </button>
        <span className="text-[11px] text-mac-label-tertiary">
          {lines} lines · {words} words · {chars} chars · {ending}
        </span>
        <div className="ml-auto">
          <CopyButton text={value} label="Copy" className="!text-[11px]" />
        </div>
      </div>
      <div className="min-h-0 flex-1 p-2">
        <CodeEditor value={value} onChange={onChange} language="text" />
      </div>
    </div>
  )
}
