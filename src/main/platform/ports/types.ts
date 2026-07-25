import type { PortEntry, PortListResult, PortProtocol } from '@shared/ports/types'

export interface RawListen {
  port: number
  protocol: PortProtocol
  address: string
  pid: number
  processName?: string
  processPath?: string
}

export interface ProcessInfo {
  name: string
  path?: string
}

export interface PortScanner {
  id: 'win32' | 'unix'
  listRaw: () => Promise<RawListen[]>
  loadProcessMap: () => Promise<Map<number, ProcessInfo>>
  kill: (pid: number) => Promise<void>
}

export type { PortEntry, PortListResult }
