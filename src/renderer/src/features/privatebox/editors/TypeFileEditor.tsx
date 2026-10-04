import type { DocType } from '@shared/secret-box/types'
import { resolveContentEditor } from '@renderer/content/editors/registry'

interface Props {
  type: DocType
  value: string
  onChange: (value: string) => void
  className?: string
  name?: string
  mimeType?: string
  onExport?: () => void
}

export function TypeFileEditor({
  type,
  value,
  onChange,
  className,
  name,
  mimeType,
  onExport
}: Props): JSX.Element {
  const Editor = resolveContentEditor(type)
  return (
    <Editor
      value={value}
      onChange={onChange}
      className={className}
      name={name}
      type={type}
      mimeType={mimeType}
      onExport={onExport}
    />
  )
}
