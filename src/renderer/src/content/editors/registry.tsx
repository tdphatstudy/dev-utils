import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import type { ComponentType } from 'react'
import type { ContentKindId } from '@shared/secret-box/content-kinds'
import { editorKindFor } from '@shared/secret-box/content-kinds'
import { JsonFileEditor } from '@renderer/features/privatebox/editors/JsonFileEditor'
import { MarkdownEditor } from '@renderer/features/privatebox/editors/MarkdownEditor'
import { TextFileEditor } from '@renderer/features/privatebox/editors/TextFileEditor'
import { MediaViewer } from '@renderer/features/privatebox/editors/MediaViewer'
import { BinaryFileView } from '@renderer/features/privatebox/editors/BinaryFileView'

export interface ContentEditorProps {
  value: string
  onChange: (value: string) => void
  className?: string
  /** Present for media / binary viewers */
  name?: string
  type?: ContentKindId
  mimeType?: string
  onExport?: () => void
}

type EditorComponent = ComponentType<ContentEditorProps>

function MediaEditorBridge(props: ContentEditorProps): JSX.Element {
  useUiLocale()
  const kind = props.type ?? 'image'
  if (kind === 'image' || kind === 'video' || kind === 'audio') {
    return (
      <MediaViewer
        value={props.value}
        name={props.name ?? 'media'}
        type={kind}
        mimeType={props.mimeType}
        className={props.className}
        onExport={props.onExport}
      />
    )
  }
  return (
    <BinaryFileView
      value={props.value}
      name={props.name ?? 'file'}
      mimeType={props.mimeType}
      className={props.className}
      onExport={props.onExport}
    />
  )
}

function BinaryEditorBridge(props: ContentEditorProps): JSX.Element {
  useUiLocale()
  return (
    <BinaryFileView
      value={props.value}
      name={props.name ?? 'file'}
      mimeType={props.mimeType}
      className={props.className}
      onExport={props.onExport}
    />
  )
}

const EDITORS: Record<'text' | 'markdown' | 'json' | 'media' | 'binary', EditorComponent> = {
  text: TextFileEditor,
  markdown: MarkdownEditor,
  json: JsonFileEditor,
  media: MediaEditorBridge,
  binary: BinaryEditorBridge
}

export function resolveContentEditor(kind: ContentKindId): EditorComponent {
  return EDITORS[editorKindFor(kind)]
}
