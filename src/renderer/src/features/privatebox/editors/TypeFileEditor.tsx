import type { DocType } from '@shared/privatebox/types'
import { resolveContentEditor } from '@renderer/content/editors/registry'

interface Props {
  type: DocType
  value: string
  onChange: (value: string) => void
  className?: string
}

export function TypeFileEditor({ type, value, onChange, className }: Props): JSX.Element {
  const Editor = resolveContentEditor(type)
  return <Editor value={value} onChange={onChange} className={className} />
}
