import { contextBridge } from 'electron'
import type { WidgetApi } from '@shared/quick-tools'
import { ipcRenderer } from 'electron'
import type { ClipboardApi } from '@shared/clipboard/types'
import type { QuickToolsApi } from '@shared/quick-tools'
import type { OcrProgress } from '@shared/ocr/types'
import type { LocaleId } from '@shared/i18n/locales'
// Kept inline in each sandboxed preload: sandbox require cannot load local chunks.
const clipboardApi: ClipboardApi = {
  state: () => ipcRenderer.invoke('clipboard:state'), configure: value => ipcRenderer.invoke('clipboard:configure', value), pause: value => ipcRenderer.invoke('clipboard:pause', value),
  list: query => ipcRenderer.invoke('clipboard:list', query), content: id => ipcRenderer.invoke('clipboard:content', id),
  copy: (id, mode, close) => ipcRenderer.invoke('clipboard:copy', id, mode, close), copyText: (text, close) => ipcRenderer.invoke('clipboard:copyText', text, close),
  paste: (id, mode) => ipcRenderer.invoke('clipboard:paste', id, mode), pasteText: text => ipcRenderer.invoke('clipboard:pasteText', text),
  update: (id, value) => ipcRenderer.invoke('clipboard:update', id, value), remove: ids => ipcRenderer.invoke('clipboard:remove', ids), clear: () => ipcRenderer.invoke('clipboard:clear'), captureCurrent: () => ipcRenderer.invoke('clipboard:captureCurrent'), ocr: id => ipcRenderer.invoke('clipboard:ocr', id),
  onChanged: callback => { const listener = (): void => callback(); ipcRenderer.on('clipboard:changed', listener); return () => { ipcRenderer.removeListener('clipboard:changed', listener) } }
}
const quickToolsApi: QuickToolsApi = {
  open: kind => ipcRenderer.invoke('quick:open', kind), shortcuts: () => ipcRenderer.invoke('quick:shortcuts'), setShortcuts: bindings => ipcRenderer.invoke('quick:setShortcuts', bindings), checkShortcut: binding => ipcRenderer.invoke('quick:checkShortcut', binding),
  onShortcutsChanged: callback => { const listener = (): void => callback(); ipcRenderer.on('quick:shortcutsChanged', listener); return () => { ipcRenderer.removeListener('quick:shortcutsChanged', listener) } }
}
const api: WidgetApi = {
  ...quickToolsApi, clipboard: clipboardApi, context: () => ipcRenderer.invoke('quick:context'), close: () => ipcRenderer.invoke('quick:close'),
  onAppearanceChanged: callback => { const listener = (_e: Electron.IpcRendererEvent, dark: unknown): void => { if (typeof dark === 'boolean') callback(dark) }; ipcRenderer.on('quick:appearanceChanged', listener); return () => { ipcRenderer.removeListener('quick:appearanceChanged', listener) } },
  onLanguageChanged: callback => {
    // Inline validation avoids a shared require chunk in the sandboxed preload.
    const supported = new Set<string>(['en', 'zh', 'es', 'fr', 'de', 'ja', 'ko', 'pt', 'ru', 'ar', 'hi', 'id', 'vi'] satisfies LocaleId[])
    const listener = (_e: Electron.IpcRendererEvent, locale: unknown): void => {
      if (typeof locale === 'string' && supported.has(locale)) callback(locale as LocaleId)
    }
    ipcRenderer.on('quick:languageChanged', listener)
    return () => { ipcRenderer.removeListener('quick:languageChanged', listener) }
  },
  onPasteTargetChanged: callback => { const listener = (_e: Electron.IpcRendererEvent, available: unknown): void => { if (typeof available === 'boolean') callback(available) }; ipcRenderer.on('quick:pasteTargetChanged', listener); return () => { ipcRenderer.removeListener('quick:pasteTargetChanged', listener) } },
  pin: value => ipcRenderer.invoke('quick:pin', value), pickColor: () => ipcRenderer.invoke('quick:pick'), lastColor: () => ipcRenderer.invoke('quick:lastColor'),
  copyText: text => ipcRenderer.invoke('quick:copyText', text), copyImage: png => ipcRenderer.invoke('quick:copyImage', png),
  ocr: {
    recognize: request => ipcRenderer.invoke('quick:ocr', request), capture: mode => ipcRenderer.invoke('quick:ocrCapture', mode), cancel: id => ipcRenderer.invoke('quick:ocrCancel', id),
    onProgress: callback => { const listener = (_e: Electron.IpcRendererEvent, value: OcrProgress): void => { if (value && typeof value.id === 'string' && typeof value.stage === 'string' && Number.isFinite(value.percent)) callback(value) }; ipcRenderer.on('ocr:progress', listener); return () => { ipcRenderer.removeListener('ocr:progress', listener) } }
  },
  mock: { status: () => ipcRenderer.invoke('quick:mockStatus'), config: () => ipcRenderer.invoke('quick:mockConfig'), start: yaml => ipcRenderer.invoke('quick:mockStart', yaml), stop: () => ipcRenderer.invoke('quick:mockStop') }
}
contextBridge.exposeInMainWorld('quickTools', api)
