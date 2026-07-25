import type { ComponentType } from 'react'
import type { ContentKindId } from '@shared/secret-box/content-kinds'
import { editorKindFor } from '@shared/secret-box/content-kinds'
import { JsonFileEditor } from '@renderer/features/privatebox/editors/JsonFileEditor'
import { MarkdownEditor } from '@renderer/features/privatebox/editors/MarkdownEditor'
import { TextFileEditor } from '@renderer/features/privatebox/editors/TextFileEditor'

export interface ContentEditorProps {
  value: string
  onChange: (value: string) => void
  className?: string
}

type EditorComponent = ComponentType<ContentEditorProps>

const EDITORS: Record<'text' | 'markdown' | 'json', EditorComponent> = {
  text: TextFileEditor,
  markdown: MarkdownEditor,
  json: JsonFileEditor
}

export function resolveContentEditor(kind: ContentKindId): EditorComponent {
  return EDITORS[editorKindFor(kind)]
}
