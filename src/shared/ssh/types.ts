/** Where DevUtils looks for SSH config + keys (user-overridable). */
export interface SshLocation {
  /**
   * Directory containing keys and usually `config`.
   * Default: `$HOME/.ssh` or `os.homedir()/.ssh`
   */
  sshDir?: string | null
  /**
   * Explicit ssh_config path when it is not `$sshDir/config`
   * (e.g. company path or `ssh -F` style file).
   */
  configPath?: string | null
}

export interface SshKeyInfo {
  name: string
  path: string
  isPublic: boolean
  privatePath?: string
  publicPath?: string
  keyType?: string
  comment?: string
  fingerprintSha256?: string
  preview?: string
  /** Key lives outside the configured sshDir (e.g. IdentityFile elsewhere) */
  external?: boolean
}

export interface SshHostEntry {
  alias: string
  patterns: string[]
  hostName?: string
  user?: string
  port: number
  identityFile?: string
  options: Record<string, string>
  /** Config file this host was loaded from */
  sourceConfig?: string
}

export interface SshHostInput {
  originalAlias?: string
  alias: string
  hostName?: string
  user?: string
  port?: number
  identityFile?: string
}

export interface SshKeyCreateInput {
  name: string
  algorithm: 'ed25519' | 'rsa'
  modulusLength?: 2048 | 3072 | 4096
  comment?: string
  overwrite?: boolean
}

export interface SshKeyCreateResult {
  privatePath: string
  publicPath: string
  publicKeyOpenSsh: string
  fingerprintSha256: string
}

export interface SshKeyRenameInput {
  path: string
  newName: string
}

export interface SshConnectRequest {
  host: string
  port?: number
  timeoutMs?: number
}

export interface SshConnectResult {
  ok: boolean
  host: string
  port: number
  timeMs: number
  error?: string
  status: 'open' | 'refused' | 'timeout' | 'error'
}

export interface SshListResult {
  /** Effective directory used for keys */
  sshDir: string
  /** Effective config file path */
  configPath: string
  /** Platform default directory (before user override) */
  defaultSshDir: string
  defaultConfigPath: string
  /** True if user overrode dir or config */
  usingCustomLocation: boolean
  exists: boolean
  keys: SshKeyInfo[]
  hosts: SshHostEntry[]
}

/** Payload wrappers for IPC that always carry location */
export type WithLocation<T> = T & { location?: SshLocation | null }
