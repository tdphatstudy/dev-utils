export type PortTier = 'system' | 'application'

export type PortProtocol = 'tcp' | 'udp'

export interface PortEntry {
  port: number
  protocol: PortProtocol
  address: string
  pid: number
  processName: string
  /** Human-friendly command / path when available */
  processPath?: string
  tier: PortTier
  /** Why this tier was chosen */
  tierReason: string
}

export interface PortListResult {
  platform: NodeJS.Platform
  entries: PortEntry[]
  scannedAt: number
}

export interface PortKillResult {
  ok: true
  port: number
  pid: number
  processName: string
  tier: PortTier
}

export interface PortKillError {
  ok: false
  error: string
}
