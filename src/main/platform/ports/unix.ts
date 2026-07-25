import { PORT_KILL_GRACE_MS } from '@shared/core/constants'
import { runCmd } from './exec'
import type { PortScanner, ProcessInfo, RawListen } from './types'

function parseLsof(stdout: string): RawListen[] {
  const rows: RawListen[] = []
  for (const line of stdout.split(/\r?\n/).slice(1)) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 9) continue
    const command = parts[0]!
    const pid = Number(parts[1])
    if (!Number.isFinite(pid)) continue
    const nameField = parts.slice(8).join(' ')
    if (!/\(LISTEN\)/i.test(nameField)) continue
    const m = /^(TCP|UDP)\s+(\S+):(\d+)/i.exec(nameField)
    if (!m) continue
    rows.push({
      protocol: m[1]!.toLowerCase() as 'tcp' | 'udp',
      address: m[2]!,
      port: Number(m[3]),
      pid,
      processName: command
    })
  }
  return rows
}

function parseSs(stdout: string): RawListen[] {
  const rows: RawListen[] = []
  for (const line of stdout.split(/\r?\n/)) {
    if (!/LISTEN/i.test(line)) continue
    const proto = /^\s*udp/i.test(line) ? 'udp' : 'tcp'
    const cols = line.trim().split(/\s+/)
    const local = cols[4] || cols[3] || ''
    const portM = /:(\d+)$/.exec(local)
    if (!portM) continue
    const pidM = /pid=(\d+)/i.exec(line)
    if (!pidM) continue
    const nameM = /\(\("([^"]+)",pid=/i.exec(line)
    rows.push({
      protocol: proto as 'tcp' | 'udp',
      address: local.replace(/:\d+$/, '') || '*',
      port: Number(portM[1]),
      pid: Number(pidM[1]),
      processName: nameM?.[1]
    })
  }
  return rows
}

async function listRaw(): Promise<RawListen[]> {
  try {
    const out = await runCmd('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN'])
    return parseLsof(out)
  } catch {
    /* fall through */
  }
  try {
    const out = await runCmd('ss', ['-ltnH', '-p'])
    return parseSs(out)
  } catch (e) {
    throw new Error(
      e instanceof Error ? `Could not list ports: ${e.message}` : 'Could not list listening ports'
    )
  }
}

async function loadProcessMap(): Promise<Map<number, ProcessInfo>> {
  return new Map()
}

async function kill(pid: number): Promise<void> {
  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    process.kill(pid, 'SIGKILL')
    return
  }
  await new Promise((r) => setTimeout(r, PORT_KILL_GRACE_MS))
  try {
    process.kill(pid, 0)
    process.kill(pid, 'SIGKILL')
  } catch {
    /* dead */
  }
}

export const unixPortScanner: PortScanner = {
  id: 'unix',
  listRaw,
  loadProcessMap,
  kill
}
