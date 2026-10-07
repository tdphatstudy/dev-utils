import type { HttpRequestPayload } from '../http/types'

export const SECURITY_TOOL_IDS = ['hacking.stress', 'hacking.hash', 'hacking.headers', 'hacking.cors', 'hacking.jwt'] as const
export type SecurityToolId = typeof SECURITY_TOOL_IDS[number]
export const isSecurityToolId = (value: unknown): value is SecurityToolId => typeof value === 'string' && (SECURITY_TOOL_IDS as readonly string[]).includes(value)
export interface Finding { severity: 'warning' | 'review' | 'pass'; rule: string; detail: string }
export interface StressInput { request: HttpRequestPayload; count: number; rate: number; concurrency: number; durationSeconds: number }
export interface StressProgress {
  id: string; state: 'running' | 'completed' | 'stopped' | 'duration-limit' | 'byte-limit'
  requested: number; started: number; completed: number; successful: number; httpErrors: number; networkErrors: number; cancelled: number; active: number; truncated: number
  bytes: number; elapsedMs: number; startsPerSecond: number; completionsPerSecond: number
  statuses: Record<string, number>; latency: { samples: number; p50?: number; p95?: number; p99?: number; max?: number }
}
export interface ProbeInput { request: HttpRequestPayload }
export interface HeaderReport { status: number; findings: Finding[]; observed: string[] }
export interface CorsInput { url: string; origin: string; method: string; headers: string[]; credentials: boolean }
export interface CorsReport { preflightStatus: number; sampleStatus: number; findings: Finding[] }
export interface BoundedResponse { status: number; headers: Record<string, string>; bytes: number; truncated: boolean; timeMs: number }
