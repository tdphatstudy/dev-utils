import { contextBridge, ipcRenderer } from 'electron'
import type { HttpRequestPayload, HttpResponsePayload } from '@shared/http/types'
import type {
  AccessInput,
  DirEntry,
  DocContent,
  DocType,
  SetupInput,
  VaultListItem,
  VaultStatus
} from '@shared/secret-box/types'
import type {
  ExportPlainResult,
  ImportPlainInput,
  SaveDocumentInput,
  SaveDocumentResult
} from '@shared/secret-box/io-types'
import type { PortKillResult, PortListResult } from '@shared/ports/types'
import type { KeygenRequest, KeygenResult } from '@shared/crypto/keygen-types'
import type { DnsRecordType, DnsLookupResult } from '@shared/network/dns'
export type { DnsRecordType, DnsLookupResult } from '@shared/network/dns'
import type {
  SshConnectRequest,
  SshConnectResult,
  SshHostEntry,
  SshHostInput,
  SshKeyCreateInput,
  SshKeyCreateResult,
  SshKeyRenameInput,
  SshListResult,
  SshLocation
} from '@shared/ssh/types'

import type { HashAlgorithm, FileHashProgress } from '@shared/file/hash'
export type { HashAlgorithm } from '@shared/file/hash'

export interface FileInfo {
  path: string
  size: number
  isFile: boolean
  mtimeMs: number
  ctimeMs: number
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
    hash: (path: string, algorithm: HashAlgorithm, requestId: string): Promise<string> =>
      ipcRenderer.invoke('file:hash', { path, algorithm, requestId }),
    cancelHash: (requestId: string): Promise<boolean> => ipcRenderer.invoke('file:cancelHash', requestId),
    onHashProgress: (callback: (progress: FileHashProgress) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, progress: FileHashProgress): void => callback(progress)
      ipcRenderer.on('file:hashProgress', listener)
      return () => ipcRenderer.removeListener('file:hashProgress', listener)
    },
    info: (path: string): Promise<FileInfo> => ipcRenderer.invoke('file:info', path),
    openDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:openFile')
  },

  net: {
    dnsLookup: (hostname: string, recordType: DnsRecordType): Promise<DnsLookupResult> =>
      ipcRenderer.invoke('net:dnsLookup', { hostname, recordType }),
    httpRequest: (payload: HttpRequestPayload, requestId: string): Promise<HttpResponsePayload> =>
      ipcRenderer.invoke('net:httpRequest', payload, requestId),
    cancelHttpRequest: (requestId: string): Promise<boolean> => ipcRenderer.invoke('net:cancelHttpRequest', requestId)
  },

  ports: {
    list: (): Promise<PortListResult> => ipcRenderer.invoke('ports:list'),
    kill: (payload: {
      port: number
      pid: number
      confirmPhrase?: string
    }): Promise<PortKillResult> => ipcRenderer.invoke('ports:kill', payload)
  },

  crypto: {
    generateKeyPair: (req: KeygenRequest): Promise<KeygenResult> =>
      ipcRenderer.invoke('crypto:generateKeyPair', req)
  },

  ssh: {
    list: (location?: SshLocation | null): Promise<SshListResult> =>
      ipcRenderer.invoke('ssh:list', location ?? null),
    resolvePaths: (
      location?: SshLocation | null
    ): Promise<{
      sshDir: string
      configPath: string
      defaultSshDir: string
      defaultConfigPath: string
      usingCustomLocation: boolean
    }> => ipcRenderer.invoke('ssh:resolvePaths', location ?? null),
    readPublic: (path: string, location?: SshLocation | null): Promise<string> =>
      ipcRenderer.invoke('ssh:readPublic', { path, location: location ?? null }),
    testConnect: (req: SshConnectRequest): Promise<SshConnectResult> =>
      ipcRenderer.invoke('ssh:testConnect', req),
    openFolder: (location?: SshLocation | null): Promise<string> =>
      ipcRenderer.invoke('ssh:openFolder', location ?? null),
    pickFolder: (): Promise<string | null> => ipcRenderer.invoke('ssh:pickFolder'),
    pickConfigFile: (): Promise<string | null> => ipcRenderer.invoke('ssh:pickConfigFile'),
    upsertHost: (
      input: SshHostInput,
      location?: SshLocation | null
    ): Promise<SshHostEntry> =>
      ipcRenderer.invoke('ssh:upsertHost', { ...input, location: location ?? null }),
    deleteHost: (alias: string, location?: SshLocation | null): Promise<void> =>
      ipcRenderer.invoke('ssh:deleteHost', { alias, location: location ?? null }),
    createKey: (
      input: SshKeyCreateInput,
      location?: SshLocation | null
    ): Promise<SshKeyCreateResult> =>
      ipcRenderer.invoke('ssh:createKey', { ...input, location: location ?? null }),
    deleteKey: (path: string, location?: SshLocation | null): Promise<void> =>
      ipcRenderer.invoke('ssh:deleteKey', { path, location: location ?? null }),
    renameKey: (
      input: SshKeyRenameInput,
      location?: SshLocation | null
    ): Promise<{ privatePath: string; publicPath?: string }> =>
      ipcRenderer.invoke('ssh:renameKey', { ...input, location: location ?? null })
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
