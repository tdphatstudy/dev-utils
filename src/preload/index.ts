import { contextBridge, ipcRenderer } from 'electron'
import type { HttpRequestPayload, HttpResponsePayload } from '../shared/http/types'
import type {
  AccessInput,
  DirEntry,
  DocContent,
  DocType,
  SetupInput,
  VaultListItem,
  VaultStatus
} from '../shared/privatebox/types'
import type {
  ExportPlainResult,
  ImportPlainInput,
  SaveDocumentInput,
  SaveDocumentResult
} from '../shared/secret-box/io-types'
import type { PortKillResult, PortListResult } from '../shared/ports/types'

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
      ipcRenderer.invoke('net:dnsLookup', { hostname, recordType }),
    httpRequest: (payload: HttpRequestPayload): Promise<HttpResponsePayload> =>
      ipcRenderer.invoke('net:httpRequest', payload)
  },

  ports: {
    list: (): Promise<PortListResult> => ipcRenderer.invoke('ports:list'),
    kill: (payload: {
      port: number
      pid: number
      confirmPhrase?: string
    }): Promise<PortKillResult> => ipcRenderer.invoke('ports:kill', payload)
  },

  privateBox: {
    getStatus: (): Promise<VaultStatus> => ipcRenderer.invoke('privateBox:getStatus'),
    pickEmptyFolder: (): Promise<string | null> =>
      ipcRenderer.invoke('privateBox:pickEmptyFolder'),
    pickVaultFolder: (): Promise<string | null> =>
      ipcRenderer.invoke('privateBox:pickVaultFolder'),
    setup: (input: SetupInput): Promise<void> => ipcRenderer.invoke('privateBox:setup', input),
    access: (input: AccessInput): Promise<void> => ipcRenderer.invoke('privateBox:access', input),
    clearAccess: (): Promise<void> => ipcRenderer.invoke('privateBox:clearAccess'),
    setActive: (id: string): Promise<void> => ipcRenderer.invoke('privateBox:setActive', id),
    removeFromList: (id: string): Promise<void> =>
      ipcRenderer.invoke('privateBox:removeFromList', id),
    renameVault: (id: string, name: string): Promise<void> =>
      ipcRenderer.invoke('privateBox:renameVault', { id, name }),
    list: (relativePath: string): Promise<DirEntry[]> =>
      ipcRenderer.invoke('privateBox:list', relativePath),
    listFolders: (): Promise<DirEntry[]> => ipcRenderer.invoke('privateBox:listFolders'),
    mkdir: (relativePath: string): Promise<void> =>
      ipcRenderer.invoke('privateBox:mkdir', relativePath),
    createFile: (relativeDir: string, name: string, type: DocType): Promise<DocContent> =>
      ipcRenderer.invoke('privateBox:createFile', { relativeDir, name, type }),
    readFile: (relativePath: string): Promise<DocContent> =>
      ipcRenderer.invoke('privateBox:readFile', relativePath),
    writeFile: (relativePath: string, content: string): Promise<DocContent> =>
      ipcRenderer.invoke('privateBox:writeFile', { relativePath, content }),
    rename: (relativePath: string, newName: string): Promise<DirEntry> =>
      ipcRenderer.invoke('privateBox:rename', { relativePath, newName }),
    remove: (relativePath: string): Promise<void> =>
      ipcRenderer.invoke('privateBox:remove', relativePath),
    ensureDefault: (): Promise<VaultListItem> =>
      ipcRenderer.invoke('privateBox:ensureDefault'),
    exportPlain: (relativePath: string): Promise<ExportPlainResult> =>
      ipcRenderer.invoke('privateBox:exportPlain', relativePath),
    exportToDisk: (relativePath: string): Promise<string | null> =>
      ipcRenderer.invoke('privateBox:exportToDisk', relativePath),
    importPlain: (input: ImportPlainInput): Promise<ExportPlainResult & { relativePath: string }> =>
      ipcRenderer.invoke('privateBox:importPlain', input),
    importFromDisk: (
      relativeDir?: string
    ): Promise<(ExportPlainResult & { relativePath: string }) | null> =>
      ipcRenderer.invoke('privateBox:importFromDisk', relativeDir),
    saveDocument: (input: SaveDocumentInput): Promise<SaveDocumentResult> =>
      ipcRenderer.invoke('privateBox:saveDocument', input),
    prepareDefaultForSave: (): Promise<{
      boxId: string
      boxName: string
      mode: 'device' | 'portable' | null
      hasAccess: boolean
    }> => ipcRenderer.invoke('privateBox:prepareDefaultForSave'),
    accessDefault: (keyB: string): Promise<void> =>
      ipcRenderer.invoke('privateBox:accessDefault', keyB)
  }
}

contextBridge.exposeInMainWorld('devutils', api)

export type DevUtilsApi = typeof api
