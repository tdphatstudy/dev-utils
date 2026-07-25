import { runCmd } from './exec'
import type { PortScanner, ProcessInfo, RawListen } from './types'

function extractPort(local: string): { address: string; port: number } | null {
  const m = /^(.*):(\d+)$/.exec(local)
  if (!m) return null
  return { address: m[1]!, port: Number(m[2]) }
}

function parseNetstatTcp(stdout: string): RawListen[] {
  const rows: RawListen[] = []
  for (const line of stdout.split(/\r?\n/)) {
    const t = line.trim()
    if (!t.toUpperCase().startsWith('TCP')) continue
    const parts = t.split(/\s+/)
    if (parts.length < 5) continue
    if (!/^LISTENING$/i.test(parts[3]!)) continue
    const parsed = extractPort(parts[1]!)
    const pid = Number(parts[parts.length - 1])
    if (!parsed || !Number.isFinite(pid) || pid <= 0) continue
    rows.push({
      protocol: 'tcp',
      address: parsed.address,
      port: parsed.port,
      pid
    })
  }
  return rows
}

async function loadProcessMap(): Promise<Map<number, ProcessInfo>> {
  const map = new Map<number, ProcessInfo>()
  try {
    const out = await runCmd('tasklist', ['/FO', 'CSV', '/NH'])
    for (const line of out.split(/\r?\n/)) {
      const t = line.trim()
      if (!t) continue
      const cols = t.match(/"([^"]*)"/g)?.map((c) => c.slice(1, -1))
      if (!cols || cols.length < 2) continue
      const pid = Number(cols[1])
      if (Number.isFinite(pid) && pid > 0) map.set(pid, { name: cols[0]! })
    }
  } catch {
    /* names optional */
  }
  return map
}

export const windowsPortScanner: PortScanner = {
  id: 'win32',
  listRaw: async () => {
    const out = await runCmd('netstat', ['-ano', '-p', 'tcp'])
    return parseNetstatTcp(out)
  },
  loadProcessMap,
  kill: async (pid) => {
    await runCmd('taskkill', ['/PID', String(pid), '/F'])
  }
}
