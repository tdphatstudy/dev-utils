import { PORT_KILL_GRACE_MS } from '@shared/core/constants'
import { runCmd } from './exec'
import type { PortScanner, ProcessInfo, RawListen } from './types'

function endpoint(value: string): { address: string; port: number } | null {
  const match = /^(.*):(\d+)$/.exec(value)
  if (!match) return null
  const port = Number(match[2])
  if (port < 1 || port > 65535) return null
  return { address: match[1]!.replace(/^\[(.*)\]$/, '$1') || '*', port }
}

// -F output avoids locale, column widths and command names containing spaces.
export function parseLsof(stdout: string): RawListen[] {
  const rows: RawListen[] = []
  let pid = 0
  let processName: string | undefined
  let name: string | undefined
  let protocol = ''
  let state = ''
  const flush = (): void => {
    const parsed = name && endpoint(name)
    if (parsed && pid > 0 && protocol === 'TCP' && state === 'LISTEN') {
      rows.push({ ...parsed, protocol: 'tcp', pid, processName })
    }
    name = undefined
    protocol = state = ''
  }
  for (const field of stdout.split(/\r?\n/)) {
    const value = field.slice(1)
    switch (field[0]) {
      case 'p': flush(); pid = /^\d+$/.test(value) ? Number(value) : 0; processName = undefined; break
      case 'c': processName = value; break
      case 'f': flush(); break
      case 'P': protocol = value; break
      case 'n': name = value; break
      case 'T': if (value.startsWith('ST=')) state = value.slice(3); break
    }
  }
  flush()
  if (stdout.trim() && !/^p\d+$/m.test(stdout)) throw new Error('Unrecognized lsof field output')
  return rows
}

export function parseSs(stdout: string): RawListen[] {
  const rows: RawListen[] = []
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue
    const cols = line.trim().split(/\s+/)
    // With TCP filtering ss normally omits Netid; accept versions that retain it.
    const offset = cols[0] === 'tcp' ? 1 : 0
    if (cols[offset] !== 'LISTEN') throw new Error('Unrecognized ss listener output')
    const parsed = endpoint(cols[offset + 3] ?? '')
    if (!parsed) throw new Error('Unrecognized ss local address')
    const owners = [...line.matchAll(/"((?:\\.|[^"\\])*)",pid=(\d+)/g)]
    if (!owners.length) rows.push({ ...parsed, protocol: 'tcp', pid: 0 })
    for (const owner of owners) rows.push({ ...parsed, protocol: 'tcp', pid: Number(owner[2]), processName: owner[1]!.replace(/\\(["\\])/g, '$1') })
  }
  return rows
}

export async function listUnixRaw(platform = process.platform): Promise<RawListen[]> {
  let lsofError: unknown
  let lsofRows: RawListen[] = []
  try {
    const out = await runCmd('lsof', ['-nP', '+c', '0', '-iTCP', '-sTCP:LISTEN', '-FpcfnPT'])
    const rows = parseLsof(out)
    if (platform !== 'linux') return rows
    lsofRows = rows
  } catch (error) {
    // lsof uses exit 1 for no matching files. Do not treat actual diagnostics as empty.
    const failure = error as { code?: unknown; stdout?: string; stderr?: string }
    if (failure.code === 1 && !failure.stdout?.trim() && !failure.stderr?.trim() && platform !== 'linux') return []
    lsofError = error
  }
  if (platform === 'linux') {
    try {
      const rows = parseSs(await runCmd('ss', ['-ltnH', '-p']))
      // ss includes sockets whose owner is hidden; enrich those with lsof if available.
      return rows.flatMap((row) => row.pid ? [row] : lsofRows.filter((known) => known.address === row.address && known.port === row.port).length
        ? lsofRows.filter((known) => known.address === row.address && known.port === row.port) : [row])
    }
    catch (error) {
      if (lsofRows.length) return lsofRows
      throw new Error(`Could not scan TCP listeners with lsof or ss. Check command availability and permissions. ${error instanceof Error ? error.message : ''}`)
    }
  }
  throw new Error(`Could not scan TCP listeners with lsof. Check installation and permissions. ${lsofError instanceof Error ? lsofError.message : ''}`)
}

async function loadProcessMap(): Promise<Map<number, ProcessInfo>> { return new Map() }

async function kill(pid: number): Promise<void> {
  try { process.kill(pid, 'SIGTERM') }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return
    throw error
  }
  await new Promise((resolve) => setTimeout(resolve, PORT_KILL_GRACE_MS))
  try { process.kill(pid, 0) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return
    throw error
  }
  process.kill(pid, 'SIGKILL')
}

export const unixPortScanner: PortScanner = { id: 'unix', listRaw: listUnixRaw, loadProcessMap, kill }
