import { describe, expect, it, vi } from 'vitest'
import { collectWindowsMachineIdParts, parseWindowsCimIds, type MachineIdCommand } from './windows-machine-id'
import { fingerprintFromParts } from '../secret-box/machine-id'

const firmware = { csproduct: ['UUID-1'], baseboard: ['BOARD-1'], bios: ['BIOS-1'], cpu: ['CPU-1', 'CPU-2'] }
const useful = (value: string): boolean => Boolean(value.trim()) && value.toLowerCase() !== 'none'

describe('Windows firmware identity compatibility', () => {
  it('reads CIM without WMIC and retains the same fingerprint parts', async () => {
    const run = vi.fn<MachineIdCommand>(async file => file.endsWith('powershell.exe') ? JSON.stringify(firmware) : '')
    const parts = await collectWindowsMachineIdParts(run, useful)
    expect(fingerprintFromParts(parts)).toBe(fingerprintFromParts(Object.values(firmware).flat()))
    const [, args, timeout] = run.mock.calls.find(([file]) => file.endsWith('powershell.exe'))!
    expect(args).toEqual(['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', expect.any(String)])
    expect(timeout).toBe(8000)
  })

  it('preserves existing WMIC values and never adds different CIM values to them', async () => {
    const headers = ['UUID', 'SerialNumber', 'SerialNumber', 'ProcessorId']
    let index = 0
    const run = vi.fn(async () => `${headers[index]}\r\n${Object.values(firmware)[index++].join('\r\n')}\r\n`)
    expect(await collectWindowsMachineIdParts(run, useful)).toEqual(Object.values(firmware).flat())
    expect(run).toHaveBeenCalledTimes(4)
  })

  it('preserves a legacy partial WMIC fingerprint without adding new identifiers', async () => {
    const run = vi.fn(async (file: string, args: string[]): Promise<string> => file.endsWith('powershell.exe') ? JSON.stringify(firmware) : args[0] === 'csproduct' ? 'UUID\r\nORIGINAL-UUID\r\n' : '')
    const parts = await collectWindowsMachineIdParts(run, useful)
    expect(parts).toEqual(['ORIGINAL-UUID'])
    expect(run).toHaveBeenCalledTimes(4)
    expect(fingerprintFromParts(parts)).toBe(fingerprintFromParts(['ORIGINAL-UUID']))
  })

  it('rejects malformed, unexpected, oversized and nonstring CIM output', () => {
    for (const output of ['null', '[]', '{}', 'not json', JSON.stringify({ ...firmware, cpu: [1] }), JSON.stringify({ ...firmware, cpu: Array(65).fill('CPU') }), ' '.repeat(65537)]) expect(parseWindowsCimIds(output)).toEqual({})
    expect(parseWindowsCimIds('\uFEFF' + JSON.stringify(firmware))).toEqual(firmware)
  })

  it('normalizes CIM values before filtering generic firmware placeholders', async () => {
    const values = { csproduct: [' None\0 '], baseboard: [' \0 '], bios: [' REAL-BIOS\0 '], cpu: [' None '] }
    const run = vi.fn<MachineIdCommand>(async file => file.endsWith('powershell.exe') ? JSON.stringify(values) : '')
    expect(await collectWindowsMachineIdParts(run, useful)).toEqual(['REAL-BIOS'])
  })
})
