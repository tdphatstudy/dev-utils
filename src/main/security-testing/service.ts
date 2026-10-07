import type { WebContents } from 'electron'
import { isSecurityToolId, type CorsInput, type CorsReport, type HeaderReport, type ProbeInput, type SecurityToolId, type StressInput, type StressProgress } from '@shared/security-testing/types'
import { checkCors, checkProbe, checkStress } from '@shared/security-testing/validation'
import { reviewCors, reviewHeaders } from '@shared/security-testing/review'
import { performTestRequest } from './request'
import { runStress } from './stress'

export class SecurityTestingService {
  private consent = new Set<SecurityToolId>()
  private jobs = new Map<number, { id: string; abort: AbortController; detach: () => void }>()
  private stressRunning = false
  accepted(id: unknown): boolean { if (!isSecurityToolId(id)) throw new Error('Unknown security tool.'); return this.consent.has(id) }
  accept(id: unknown): void { if (!isSecurityToolId(id)) throw new Error('Unknown security tool.'); this.consent.add(id) }
  private require(id: SecurityToolId): void { if (!this.accepted(id)) throw new Error('Read and agree to the security testing warning first.') }
  private async job<T>(owner: WebContents, id: unknown, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error('Invalid security test ID.')
    if (owner.isDestroyed() || this.jobs.has(owner.id)) throw new Error('A security network operation is already running or this window is closed.')
    const abort = new AbortController(), stop = (): void => abort.abort(), navigation = (_event: unknown, _url: string, _inPlace: boolean, mainFrame: boolean): void => { if (mainFrame) stop() }
    owner.once('destroyed', stop); owner.once('render-process-gone', stop); owner.on('did-start-navigation', navigation)
    const job = { id, abort, detach: (): void => { owner.removeListener('destroyed', stop); owner.removeListener('render-process-gone', stop); owner.removeListener('did-start-navigation', navigation) } }
    this.jobs.set(owner.id, job)
    try { return await run(abort.signal) }
    finally { job.detach(); if (this.jobs.get(owner.id) === job) this.jobs.delete(owner.id) }
  }
  stop(owner: number, id: unknown): boolean {
    if (typeof id !== 'string' || id.length > 80) throw new Error('Invalid security test ID.')
    const job = this.jobs.get(owner)
    if (!job || job.id !== id) return false
    job.abort.abort(); return true
  }
  async stress(owner: WebContents, input: unknown, id: string): Promise<StressProgress> {
    this.require('hacking.stress'); checkStress(input)
    if (this.stressRunning) throw new Error('Only one API stress test can run in this app at a time.')
    this.stressRunning = true
    try { return await this.job(owner, id, signal => runStress(input as StressInput, id, signal, value => { if (!owner.isDestroyed()) { try { owner.send('securityTesting:progress', value) } catch { /* closing */ } } })) }
    finally { this.stressRunning = false }
  }
  headers(owner: WebContents, input: unknown, id: string): Promise<HeaderReport> {
    this.require('hacking.headers'); checkProbe(input)
    return this.job(owner, id, async signal => {
      const response = await performTestRequest((input as ProbeInput).request, signal)
      return reviewHeaders(response.headers, new URL(input.request.url).protocol === 'https:', response.status)
    })
  }
  cors(owner: WebContents, input: unknown, id: string): Promise<CorsReport> {
    this.require('hacking.cors'); checkCors(input)
    return this.job(owner, id, async signal => {
      const value = input as CorsInput
      const preflight = await performTestRequest({ method: 'OPTIONS', url: value.url, headers: { Origin: value.origin, 'Access-Control-Request-Method': value.method, ...(value.headers.length ? { 'Access-Control-Request-Headers': value.headers.join(', ') } : {}) }, timeoutMs: 10000 }, signal)
      if (signal.aborted) throw new Error('Security test stopped.')
      const sample = await performTestRequest({ method: 'GET', url: value.url, headers: { Origin: value.origin }, timeoutMs: 10000 }, signal)
      return reviewCors(value, preflight, sample)
    })
  }
  dispose(): void { for (const job of this.jobs.values()) { job.abort.abort(); job.detach() }; this.jobs.clear(); this.consent.clear() }
}
