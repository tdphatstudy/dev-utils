import { PORT_MAX, PORT_MIN, PROTECTED_PIDS } from '@shared/core/constants'
import { classifyPort } from '@shared/ports/classify'
import type { PortEntry, PortKillResult, PortListResult } from '@shared/ports/types'
import { runCmd } from './exec'
import { unixPortScanner } from './unix'
import type { PortScanner, RawListen } from './types'
import { windowsPortScanner } from './windows'

const SCANNERS: Record<string, PortScanner> = {
  win32: windowsPortScanner,
  linux: unixPortScanner,
  darwin: unixPortScanner,
  freebsd: unixPortScanner,
  openbsd: unixPortScanner
}

export function getPortScanner(): PortScanner {
  return SCANNERS[process.platform] ?? unixPortScanner
}

function selfPids(): Set<number> {
  const s = new Set<number>([process.pid, ...PROTECTED_PIDS])
  if (typeof process.ppid === 'number') s.add(process.ppid)
  return s
}

function dedupe(raw: RawListen[]): RawListen[] {
  const map = new Map<string, RawListen>()
  for (const r of raw) {
    const key = `${r.protocol}:${r.port}:${r.pid}:${r.address}`
    if (!map.has(key)) map.set(key, r)
  }
  return [...map.values()]
}

export async function listListeningPorts(): Promise<PortListResult> {
  const scanner = getPortScanner()
  const [rawList, procMap] = await Promise.all([
    scanner.listRaw(),
    scanner.loadProcessMap()
  ])
  const raw = dedupe(rawList)

  const missing = [...new Set(raw.filter((r) => !r.processName && !procMap.has(r.pid)).map((r) => r.pid))]
  if (missing.length > 0 && scanner.id === 'unix') {
    try {
      const out = await runCmd('ps', ['-o', 'pid=,comm=', '-p', missing.join(',')])
      for (const line of out.split(/\r?\n/)) {
        const m = /^\s*(\d+)\s+(.+)$/.exec(line.trim())
        if (!m) continue
        procMap.set(Number(m[1]), { name: m[2]!.trim() })
      }
    } catch {
      /* optional */
    }
  }

  const entries: PortEntry[] = raw.map((r) => {
    const fromMap = procMap.get(r.pid)
    const processName = r.processName || fromMap?.name || `pid-${r.pid}`
    const processPath = r.processPath || fromMap?.path
    const { tier, reason } = classifyPort({ port: r.port, processName, processPath })
    return {
      port: r.port,
      protocol: r.protocol,
      address: r.address,
      pid: r.pid,
      processName,
      processPath,
      tier,
      tierReason: reason
    }
  })

  entries.sort((a, b) => a.port - b.port || a.pid - b.pid)

  return {
    platform: process.platform,
    entries,
    scannedAt: Date.now()
  }
}

export async function killProcessOnPort(
  port: number,
  pid: number,
  options?: { confirmPhrase?: string }
): Promise<PortKillResult> {
  if (!Number.isInteger(port) || port < PORT_MIN || port > PORT_MAX) {
    throw new Error('Invalid port')
  }
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error('Invalid PID')
  }
  if (selfPids().has(pid)) {
    throw new Error(`Refusing to kill protected process PID ${pid}`)
  }

  const list = await listListeningPorts()
  const match = list.entries.find((e) => e.port === port && e.pid === pid)
  if (!match) {
    throw new Error(`No listening process on port ${port} with PID ${pid}`)
  }

  if (match.tier === 'system') {
    const needed = `kill ${port}`
    if ((options?.confirmPhrase ?? '').trim().toLowerCase() !== needed) {
      throw new Error(`System port requires typed confirmation: type exactly "${needed}"`)
    }
  }

  await getPortScanner().kill(pid)

  return {
    ok: true,
    port,
    pid,
    processName: match.processName,
    tier: match.tier
  }
}
