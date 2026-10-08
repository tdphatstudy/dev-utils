import type { LocalDomainInput, LocalDomainPorts, LocalDomainsStatus, DomainResolution } from '@shared/local-domains/types'
import { isLanguageState, type LanguageSetting, type LanguageState } from '@shared/i18n/locales'
import { contextBridge, ipcRenderer } from 'electron'
import type { ClipboardApi } from '@shared/clipboard/types'
import type { QuickToolsApi } from '@shared/quick-tools'
import { isVaultLockEvent, type RecoveredVaultDraft, type SecurityState, type VaultIdleMinutes, type VaultLockEvent } from '@shared/security-policy'
import type { HttpRequestPayload, HttpResponsePayload } from '@shared/http/types'
import type { SecurityToolId, StressInput, StressProgress, ProbeInput, HeaderReport, CorsInput, CorsReport } from '@shared/security-testing/types'
import type {
  AccessInput,
  DirEntry,
  DocContent,
  DocType,
  SetupInput,
  VaultListItem,
  VaultStatus,
  RecoverMetadataInput, RecoverMetadataResult, KeepNotesPage
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
  SshKeyDeleteResult,
  SshKeyRenameInput,
  SshListResult,
  SshLocation
} from '@shared/ssh/types'

import type { HashAlgorithm, FileHashProgress } from '@shared/file/hash'
import type { ScreenColorResult } from '@shared/color'
import type { OcrRequest, OcrCaptureRequest, OcrProgress, OcrResult } from '@shared/ocr/types'
import type { MockStatus } from '@shared/mock-api/types'
import { isQuickTarget, type QuickTarget } from '@shared/quick-actions'
export type { HashAlgorithm } from '@shared/file/hash'

export interface FileInfo {
  path: string
  size: number
  isFile: boolean
  mtimeMs: number
  ctimeMs: number
}

// Kept inline in each sandboxed preload: sandbox require cannot load local chunks.
const clipboardApi: ClipboardApi = {
  state: () => ipcRenderer.invoke('clipboard:state'), configure: value => ipcRenderer.invoke('clipboard:configure', value), pause: value => ipcRenderer.invoke('clipboard:pause', value),
  list: query => ipcRenderer.invoke('clipboard:list', query), content: id => ipcRenderer.invoke('clipboard:content', id),
  copy: (id, mode, close) => ipcRenderer.invoke('clipboard:copy', id, mode, close), copyText: (text, close) => ipcRenderer.invoke('clipboard:copyText', text, close),
  update: (id, value) => ipcRenderer.invoke('clipboard:update', id, value), remove: ids => ipcRenderer.invoke('clipboard:remove', ids), clear: () => ipcRenderer.invoke('clipboard:clear'), captureCurrent: () => ipcRenderer.invoke('clipboard:captureCurrent'), ocr: id => ipcRenderer.invoke('clipboard:ocr', id),
  onChanged: callback => { const listener = (): void => callback(); ipcRenderer.on('clipboard:changed', listener); return () => ipcRenderer.removeListener('clipboard:changed', listener) }
}
const quickToolsApi: QuickToolsApi = {
  open: kind => ipcRenderer.invoke('quick:open', kind), shortcuts: () => ipcRenderer.invoke('quick:shortcuts'), setShortcuts: bindings => ipcRenderer.invoke('quick:setShortcuts', bindings), checkShortcut: binding => ipcRenderer.invoke('quick:checkShortcut', binding),
  onShortcutsChanged: callback => { const listener = (): void => callback(); ipcRenderer.on('quick:shortcutsChanged', listener); return () => ipcRenderer.removeListener('quick:shortcutsChanged', listener) }
}

const api = {
  clipboard: clipboardApi,
  quickTools: quickToolsApi,
  securityTesting: {
    accepted: (id: SecurityToolId): Promise<boolean> => ipcRenderer.invoke('securityTesting:accepted', id),
    accept: (id: SecurityToolId): Promise<void> => ipcRenderer.invoke('securityTesting:accept', id),
    stress: (input: StressInput, id: string): Promise<StressProgress> => ipcRenderer.invoke('securityTesting:stress', input, id),
    headers: (input: ProbeInput, id: string): Promise<HeaderReport> => ipcRenderer.invoke('securityTesting:headers', input, id),
    cors: (input: CorsInput, id: string): Promise<CorsReport> => ipcRenderer.invoke('securityTesting:cors', input, id),
    stop: (id: string): Promise<boolean> => ipcRenderer.invoke('securityTesting:stop', id),
    onProgress: (callback: (value: StressProgress) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, value: StressProgress): void => { if (value && typeof value.id === 'string' && typeof value.started === 'number') callback(value) }
      ipcRenderer.on('securityTesting:progress', listener)
      return () => ipcRenderer.removeListener('securityTesting:progress', listener)
    }
  },
  security: {
    lock: (): Promise<void> => ipcRenderer.invoke('security:lock'),
    state: (): Promise<SecurityState> => ipcRenderer.invoke('security:state'),
    setIdleMinutes: (minutes: VaultIdleMinutes): Promise<SecurityState> => ipcRenderer.invoke('security:setIdleMinutes', minutes),
    preserveDraft: (id: string, content: string): Promise<void> => ipcRenderer.invoke('security:preserveDraft', id, content),
    releaseEmpty: (id: string): Promise<void> => ipcRenderer.invoke('security:releaseEmpty', id),
    recoverDraft: (sessionId: string): Promise<RecoveredVaultDraft | null> => ipcRenderer.invoke('security:recoverDraft', sessionId),
    discardDraft: (sessionId: string, id: string): Promise<void> => ipcRenderer.invoke('security:discardDraft', sessionId, id),
    onVaultLocked: (callback: (event: VaultLockEvent) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, value: unknown): void => { if (isVaultLockEvent(value)) callback(value) }
      ipcRenderer.on('security:vaultLocked', listener)
      return () => ipcRenderer.removeListener('security:vaultLocked', listener)
    }
  },
  platform: (): Promise<NodeJS.Platform> => ipcRenderer.invoke('app:platform'),
  version: (): Promise<string> => ipcRenderer.invoke('app:version'),
  app: {
    language: (): Promise<LanguageState> => ipcRenderer.invoke('app:language'),
    setLanguage: (language: LanguageSetting): Promise<LanguageState> => ipcRenderer.invoke('app:setLanguage', language),
    onLanguageChanged: (callback: (state: LanguageState) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, value: unknown): void => { if (isLanguageState(value)) callback(value) }
      ipcRenderer.on('app:languageChanged', listener)
      return () => ipcRenderer.removeListener('app:languageChanged', listener)
    },
    trayAvailable: (): Promise<boolean> => ipcRenderer.invoke('app:trayAvailable'),
    quit: (): Promise<void> => ipcRenderer.invoke('app:quit'),
    onOpenTool: (callback: (target: QuickTarget) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, target: unknown): void => { if (isQuickTarget(target)) callback(target) }
      ipcRenderer.on('app:openTool', listener)
      return () => ipcRenderer.removeListener('app:openTool', listener)
    }
  },
  color: {
    pickScreen: (): Promise<ScreenColorResult> => ipcRenderer.invoke('color:pickScreen'),
    lastScreen: (): Promise<string | null> => ipcRenderer.invoke('color:lastScreen'),
    onPicked: (callback: (hex: string) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, hex: unknown): void => { if (typeof hex === 'string' && /^#[0-9A-F]{6}$/.test(hex)) callback(hex) }
      ipcRenderer.on('color:picked', listener)
      return () => ipcRenderer.removeListener('color:picked', listener)
    }
  },
  ocr: {
    recognize: (request: OcrRequest): Promise<OcrResult | null> => ipcRenderer.invoke('ocr:recognize', request),
    capture: (request: OcrCaptureRequest): Promise<OcrResult | null> => ipcRenderer.invoke('ocr:capture', request),
    cancel: (id: string): Promise<boolean> => ipcRenderer.invoke('ocr:cancel', id),
    onProgress: (callback: (progress: OcrProgress) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, progress: OcrProgress): void => callback(progress)
      ipcRenderer.on('ocr:progress', listener)
      return () => ipcRenderer.removeListener('ocr:progress', listener)
    }
  },

  window: {
    minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
    maximize: (): Promise<void> => ipcRenderer.invoke('window:maximize'),
    close: (): Promise<void> => ipcRenderer.invoke('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized')
  },

  localDomains: {
    status: (): Promise<LocalDomainsStatus> => ipcRenderer.invoke('local-domains:status'),
    add: (input: LocalDomainInput): Promise<LocalDomainsStatus> => ipcRenderer.invoke('local-domains:add', input),
    setPorts: (ports: LocalDomainPorts): Promise<LocalDomainsStatus> => ipcRenderer.invoke('local-domains:ports', ports),
    enable: (id: string): Promise<LocalDomainsStatus> => ipcRenderer.invoke('local-domains:enable', id),
    disable: (id: string): Promise<LocalDomainsStatus> => ipcRenderer.invoke('local-domains:disable', id),
    remove: (id: string): Promise<LocalDomainsStatus> => ipcRenderer.invoke('local-domains:remove', id),
    cleanup: (): Promise<void> => ipcRenderer.invoke('local-domains:cleanup'),
    setupHttps: (): Promise<LocalDomainsStatus> => ipcRenderer.invoke('local-domains:setup-https'),
    removeCa: (): Promise<LocalDomainsStatus> => ipcRenderer.invoke('local-domains:remove-ca'),
    resolve: (domain: string): Promise<DomainResolution> => ipcRenderer.invoke('local-domains:resolve', domain),
    open: (id: string): Promise<void> => ipcRenderer.invoke('local-domains:open', id),
    mkcertHelp: (): Promise<void> => ipcRenderer.invoke('local-domains:mkcert-help')
  },

  mockApi: {
    start: (yaml: string): Promise<MockStatus> => ipcRenderer.invoke('mock-api:start', yaml),
    apply: (yaml: string): Promise<MockStatus> => ipcRenderer.invoke('mock-api:apply', yaml),
    stop: (): Promise<MockStatus> => ipcRenderer.invoke('mock-api:stop'),
    status: (): Promise<MockStatus> => ipcRenderer.invoke('mock-api:status'),
    getConfig: (): Promise<string | null> => ipcRenderer.invoke('mock-api:config'),
    clearLogs: (): Promise<MockStatus> => ipcRenderer.invoke('mock-api:clear-logs')
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
    deleteKey: (path: string, location?: SshLocation | null): Promise<SshKeyDeleteResult> =>
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
    access: (input: AccessInput): Promise<string> => ipcRenderer.invoke('privateBox:access', input),
    recoverMetadata: (input: RecoverMetadataInput): Promise<RecoverMetadataResult> => ipcRenderer.invoke('privateBox:recoverMetadata', input),
    clearAccess: (): Promise<void> => ipcRenderer.invoke('privateBox:clearAccess'),
    setActive: (id: string): Promise<void> => ipcRenderer.invoke('privateBox:setActive', id),
    removeFromList: (id: string): Promise<void> =>
      ipcRenderer.invoke('privateBox:removeFromList', id),
    renameVault: (id: string, name: string): Promise<void> =>
      ipcRenderer.invoke('privateBox:renameVault', { id, name }),
    list: (relativePath: string, sessionId: string): Promise<DirEntry[]> =>
      ipcRenderer.invoke('privateBox:list', { relativePath, sessionId }),
    listFolders: (sessionId: string): Promise<DirEntry[]> => ipcRenderer.invoke('privateBox:listFolders', { sessionId }),
    mkdir: (relativePath: string, sessionId: string): Promise<void> =>
      ipcRenderer.invoke('privateBox:mkdir', { relativePath, sessionId }),
    createFile: (relativeDir: string, name: string, type: DocType, sessionId: string): Promise<DocContent> =>
      ipcRenderer.invoke('privateBox:createFile', { relativeDir, name, type, sessionId }),
    readFile: (relativePath: string, sessionId: string): Promise<DocContent> =>
      ipcRenderer.invoke('privateBox:readFile', { relativePath, sessionId }),
    writeFile: (relativePath: string, content: string, sessionId: string): Promise<DocContent> =>
      ipcRenderer.invoke('privateBox:writeFile', { relativePath, content, sessionId }),
    rename: (relativePath: string, newName: string, sessionId: string): Promise<DirEntry> =>
      ipcRenderer.invoke('privateBox:rename', { relativePath, newName, sessionId }),
    remove: (relativePath: string, sessionId: string): Promise<void> =>
      ipcRenderer.invoke('privateBox:remove', { relativePath, sessionId }),
    ensureDefault: (): Promise<VaultListItem> =>
      ipcRenderer.invoke('privateBox:ensureDefault'),
    exportPlain: (relativePath: string, sessionId: string): Promise<ExportPlainResult> =>
      ipcRenderer.invoke('privateBox:exportPlain', { relativePath, sessionId }),
    exportToDisk: (relativePath: string, sessionId: string): Promise<string | null> =>
      ipcRenderer.invoke('privateBox:exportToDisk', { relativePath, sessionId }),
    importPlain: (input: ImportPlainInput, sessionId: string): Promise<ExportPlainResult & { relativePath: string }> =>
      ipcRenderer.invoke('privateBox:importPlain', { ...input, sessionId }),
    importFromDisk: (
      relativeDir: string, sessionId: string
    ): Promise<(ExportPlainResult & { relativePath: string }) | null> =>
      ipcRenderer.invoke('privateBox:importFromDisk', { relativeDir, sessionId }),
    saveDocument: (input: SaveDocumentInput, sessionId: string): Promise<SaveDocumentResult> =>
      ipcRenderer.invoke('privateBox:saveDocument', { ...input, sessionId }),
    prepareDefaultForSave: (): Promise<{
      boxId: string
      boxName: string
      mode: 'device' | 'portable' | null
      hasAccess: boolean
      sessionId?: string
    }> => ipcRenderer.invoke('privateBox:prepareDefaultForSave'),
    accessDefault: (keyB: string): Promise<string> =>
      ipcRenderer.invoke('privateBox:accessDefault', keyB),
    listKeepNotes: (sessionId: string, cursor?: string): Promise<KeepNotesPage> =>
      ipcRenderer.invoke('privateBox:listKeepNotes', { sessionId, cursor })
  }
}

contextBridge.exposeInMainWorld('devutils', api)

export type DevUtilsApi = typeof api
