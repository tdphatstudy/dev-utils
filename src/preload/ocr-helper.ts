import { contextBridge, ipcRenderer } from 'electron'
import type { OcrView, OcrResult, OcrSelection, OcrProgress } from '@shared/ocr/types'

const api = {
  view: (): Promise<OcrView> => ipcRenderer.invoke('ocrHelper:view'),
  ready: (): Promise<void> => ipcRenderer.invoke('ocrHelper:ready'),
  select: (selection: OcrSelection): Promise<void> => ipcRenderer.invoke('ocrHelper:select', selection),
  complete: (result: OcrResult): Promise<void> => ipcRenderer.invoke('ocrHelper:complete', result),
  progress: (value: Omit<OcrProgress, 'id'>): Promise<void> => ipcRenderer.invoke('ocrHelper:progress', value),
  fail: (message: string): Promise<void> => ipcRenderer.invoke('ocrHelper:fail', message),
  close: (): Promise<void> => ipcRenderer.invoke('ocrHelper:close'),
  copy: (): Promise<void> => ipcRenderer.invoke('ocrHelper:copy')
}
contextBridge.exposeInMainWorld('ocrHelper', api)
export type OcrHelperApi = typeof api
