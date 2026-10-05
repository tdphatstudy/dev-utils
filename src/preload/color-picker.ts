import { contextBridge, ipcRenderer } from 'electron'
import type { ColorFormat, PickerView } from '@shared/color/picker'

const api = {
  view: (): Promise<PickerView> => ipcRenderer.invoke('screenPicker:view'),
  ready: (): Promise<void> => ipcRenderer.invoke('screenPicker:ready'),
  select: (hex: string): Promise<void> => ipcRenderer.invoke('screenPicker:select', hex),
  cancel: (): Promise<void> => ipcRenderer.invoke('screenPicker:cancel'),
  repick: (): Promise<void> => ipcRenderer.invoke('screenPicker:repick'),
  copy: (format: ColorFormat): Promise<void> => ipcRenderer.invoke('screenPicker:copy', format),
  close: (): Promise<void> => ipcRenderer.invoke('screenPicker:close')
}
contextBridge.exposeInMainWorld('screenPicker', api)
