import { ClipboardPanel } from '@renderer/features/clipboard/ClipboardPanel'
import { useI18n } from '@renderer/i18n'
export default function ClipboardManagerTool(): JSX.Element {
  const { t } = useI18n()
  return <div className="h-full overflow-auto p-4 sm:p-6"><div className="mx-auto max-w-5xl"><ClipboardPanel api={window.devutils?.clipboard} t={t} openWidget={window.devutils?.quickTools ? () => window.devutils.quickTools.open('clipboard') : undefined} /></div></div>
}
