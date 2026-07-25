import { describe, expect, it } from 'vitest'
import { classifyPort, systemKillConfirmPhrase } from './classify'

describe('classifyPort', () => {
  it('marks privileged ports as system', () => {
    const r = classifyPort({ port: 80, processName: 'nginx' })
    expect(r.tier).toBe('system')
  })

  it('marks critical process as system', () => {
    const r = classifyPort({ port: 50000, processName: 'svchost.exe' })
    expect(r.tier).toBe('system')
  })

  it('marks node on 3000 as application', () => {
    const r = classifyPort({ port: 3000, processName: 'node.exe' })
    expect(r.tier).toBe('application')
  })

  it('marks common dev port as application', () => {
    const r = classifyPort({ port: 5173, processName: 'esbuild' })
    expect(r.tier).toBe('application')
  })

  it('confirm phrase', () => {
    expect(systemKillConfirmPhrase(445)).toBe('kill 445')
  })
})
