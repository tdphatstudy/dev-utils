import { contextBridge, ipcRenderer } from 'electron'

export type HashAlgorithm = 'md5' | 'sha1' | 'sha256' | 'sha512'
export type DnsRecordType = 'A' | 'AAAA' | 'MX' | 'TXT' | 'CNAME' | 'NS'

export interface FileInfo {
  path: string
  size: number
  isFile: boolean
  mtimeMs: number
  ctimeMs: number
}

export interface DnsLookupResult {
  hostname: string
  type: DnsRecordType
  records: unknown
}

const api = {
  platform: (): Promise<NodeJS.Platform> => ipcRenderer.invoke('app:platform'),
  version: (): Promise<string> => ipcRenderer.invoke('app:version'),

  window: {
    minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
    maximize: (): Promise<void> => ipcRenderer.invoke('window:maximize'),
    close: (): Promise<void> => ipcRenderer.invoke('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized')
  },

  file: {
    hash: (path: string, algorithm: HashAlgorithm): Promise<string> =>
      ipcRenderer.invoke('file:hash', { path, algorithm }),
    info: (path: string): Promise<FileInfo> => ipcRenderer.invoke('file:info', path),
    openDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:openFile')
  },

  net: {
    dnsLookup: (hostname: string, recordType: DnsRecordType): Promise<DnsLookupResult> =>
      ipcRenderer.invoke('net:dnsLookup', { hostname, recordType })
  }
}

contextBridge.exposeInMainWorld('devutils', api)

export type DevUtilsApi = typeof api
