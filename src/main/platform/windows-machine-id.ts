import { join } from 'node:path'

export type MachineIdCommand = (file: string, args: string[], timeoutMs?: number) => Promise<string>

const SOURCES = [
  ['csproduct', 'Win32_ComputerSystemProduct', 'UUID'],
  ['baseboard', 'Win32_BaseBoard', 'SerialNumber'],
  ['bios', 'Win32_BIOS', 'SerialNumber'],
  ['cpu', 'Win32_Processor', 'ProcessorId']
] as const

const CIM_SCRIPT = [
  "$ErrorActionPreference='Stop'",
  '[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)',
  '$result=@{}',
  ...SOURCES.map(([source, className, property]) => `try { $result['${source}']=@(Get-CimInstance -ClassName ${className} -ErrorAction Stop | ForEach-Object { [string]$_.${property} }) } catch { $result['${source}']=@() }`),
  'ConvertTo-Json -InputObject $result -Compress -Depth 3'
].join('\n')

function tableValues(output: string, header: string): string[] {
  return output.split(/\r?\n/).map(value => value.trim()).filter(value => value && value.toLowerCase() !== header.toLowerCase())
}

export function parseWindowsCimIds(output: string): Record<string, string[]> {
  if (Buffer.byteLength(output) > 64 * 1024) return {}
  try {
    const value: unknown = JSON.parse(output.replace(/^\uFEFF/, '').trim())
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    const record = value as Record<string, unknown>
    const result: Record<string, string[]> = {}
    for (const [source] of SOURCES) {
      const items = record[source]
      if (!Array.isArray(items) || items.length > 64 || items.some(item => typeof item !== 'string' || item.length > 4096)) return {}
      result[source] = items as string[]
    }
    return result
  } catch {
    return {}
  }
}

export async function collectWindowsMachineIdParts(run: MachineIdCommand, useful: (value: string) => boolean, systemRoot = process.env.SystemRoot || 'C:\\Windows'): Promise<string[]> {
  const wmic = join(systemRoot, 'System32', 'wbem', 'WMIC.exe')
  const values = await Promise.all(SOURCES.map(async ([source, , property]) => {
    const output = await run(wmic, [source, 'get', property], 4000)
    return tableValues(output, property).filter(useful)
  }))
  if (values.some(parts => parts.length > 0)) return values.flat()
  const powershell = join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const output = await run(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(CIM_SCRIPT, 'utf16le').toString('base64')], 8000)
  const fallback = parseWindowsCimIds(output)
  return SOURCES.flatMap(([source]) => (fallback[source] ?? []).map(value => value.replace(/\0/g, '').trim()).filter(useful))
}
